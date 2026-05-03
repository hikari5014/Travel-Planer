import "server-only";
import { prisma } from "@/lib/db";
import { getSettingsView } from "./settings-service";
import type { PlaceIconKey } from "@/lib/place-icon";
import { canViewTrip } from "./share-service";
import { parseTransitSteps, summarizeTransitSteps } from "./directions-service";

// PDF-export-specific aggregate query. Lighter than EditorTrip but covers
// all sections the PDF document needs (cover/days/expenses/tickets/AI).

export type PdfPlace = {
  id: string;
  name: string;
  category: string;
  iconKey: PlaceIconKey;
  rating: number;
  address: string;
};

export type PdfScheduleItem = {
  id: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  isAllDay: boolean;
  hasTicket: boolean;
  note: string | null;
  placeId: string | null;
  kind: string;
};

// Transit step subset surfaced into the PDF — one row per transit / walking
// segment between two stations. Phase 11.4.
export type PdfTransitStep =
  | {
      kind: "WALK";
      distanceMeters: number;
      durationSec: number;
      instruction?: string;
    }
  | {
      kind: "TRANSIT";
      durationSec: number;
      distanceMeters: number;
      lineName: string;
      lineNameShort?: string;
      lineColor?: string;
      vehicleType?: string;
      headsign?: string;
      headwaySec?: number;
      departureStop: string;
      arrivalStop: string;
      departureTime?: string;
      arrivalTime?: string;
      stopCount?: number;
      agency?: string;
    };

export type PdfFlightInfo = {
  flightNumber: string | null;
  airline: string | null;
  depAirport: string | null;
  arrAirport: string | null;
  depTime: string | null;
  arrTime: string | null;
  arrDateOffset: number | null;
  terminal: string | null;
  seatNumber: string | null;
  isInternational: boolean | null;
};

export type PdfTransport = {
  fromItemId: string;
  toItemId: string;
  mode: string;
  distanceM: number;
  durationSec: number;
  // Phase 11.4 — surface cached transit detail / fare / flight metadata
  fareAmount: number | null;
  fareCurrency: string | null;
  transitLine: string | null;          // free-form summary (e.g. "JR山手線→銀座線")
  transitSteps: PdfTransitStep[];      // parsed from directionsCacheJson
  transferCount: number | null;
  walkingMeters: number | null;
  flight: PdfFlightInfo | null;        // when mode === "FLIGHT"
};

export type PdfDay = {
  id: string;
  dayIndex: number;
  date: string;
  weekday: string;
  items: PdfScheduleItem[];
  transports: PdfTransport[];
};

export type PdfExpense = {
  id: string;
  category: string;
  note: string | null;
  amount: number;
  currency: string;
  amountInBase: number;
};

export type PdfTicket = {
  id: string;
  title: string;
  category: string;
  bookingRef: string | null;
  quantity: number;
  price: number;
  currency: string;
  placeName: string | null;
  dayIndex: number | null;
};

export type PdfAiSection = {
  category: string;       // PRE_TRIP_NOTES / PACKING_CHECKLIST
  zhTitle: string;
  enTitle: string;
  bullets: { zh: string; en: string }[];
};

export type PdfTripData = {
  tripId: string;
  title: string;
  subtitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  baseCurrency: string;
  localCurrency: string;
  fxRates: Record<string, number>;
  planName: string;
  pace: string;
  totalCost: number;
  costBreakdown: { food: number; lodging: number; transport: number; ticket: number; misc: number };
  totalDistanceKm: number;
  places: Record<string, PdfPlace>;
  days: PdfDay[];
  expenses: PdfExpense[];
  tickets: PdfTicket[];
  ai: PdfAiSection[];
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export async function loadPdfTrip(tripId: string): Promise<PdfTripData | null> {
  if (!(await canViewTrip(tripId))) return null;
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      plans: {
        orderBy: { displayOrder: "asc" },
        include: {
          aiSuggestions: { orderBy: { generatedAt: "desc" } },
          days: {
            orderBy: { dayIndex: "asc" },
            include: {
              scheduleItems: {
                orderBy: [{ isAllDay: "desc" }, { orderIndex: "asc" }],
                include: {
                  place: true,
                  outgoingTransport: true,
                  tickets: true,
                },
              },
            },
          },
        },
      },
      expenses: true,
    },
  });
  if (!trip) return null;

  const settings = await getSettingsView();

  const planId = trip.defaultPlanId ?? trip.plans[0]?.id;
  const plan = trip.plans.find((p) => p.id === planId) ?? trip.plans[0];
  if (!plan) return null;

  const places: Record<string, PdfPlace> = {};
  const tickets: PdfTicket[] = [];
  let totalDistanceM = 0;

  const days: PdfDay[] = plan.days.map((d) => {
    for (const it of d.scheduleItems) {
      if (it.place) {
        places[it.place.googlePlaceId] = {
          id: it.place.googlePlaceId,
          name: it.place.name,
          category: it.place.category,
          iconKey: (it.place.iconKey as PlaceIconKey) ?? "landmark",
          rating: it.place.rating ?? 0,
          address: it.place.address ?? "",
        };
      }
      for (const t of it.tickets) {
        tickets.push({
          id: t.id,
          title: t.title,
          category: t.category,
          bookingRef: t.bookingRef,
          quantity: t.quantity,
          price: t.price,
          currency: t.currency,
          placeName: it.place?.name ?? null,
          dayIndex: d.dayIndex,
        });
      }
    }
    const items: PdfScheduleItem[] = d.scheduleItems.map((it) => ({
      id: it.id,
      startTime: it.startTime,
      endTime: it.endTime,
      durationMin: it.durationMin,
      isAllDay: it.isAllDay,
      hasTicket: it.tickets.length > 0,
      note: it.note,
      placeId: it.placeId,
      kind: it.kind,
    }));
    const transports: PdfTransport[] = d.scheduleItems
      .map((it) => it.outgoingTransport)
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => {
        totalDistanceM += t.distanceMeters ?? 0;

        // Parse cached transit / flight detail for PDF rendering. Both
        // sources are JSON strings stored on the Transport row; parseTransitSteps
        // auto-detects legacy vs NEW Routes API shape.
        let transitSteps: PdfTransitStep[] = [];
        let transferCount: number | null = null;
        let walkingMeters: number | null = null;
        if (t.directionsCacheJson) {
          try {
            const parsed = parseTransitSteps(JSON.parse(t.directionsCacheJson));
            transitSteps = parsed.filter(
              (s): s is PdfTransitStep =>
                s.kind === "WALK" || s.kind === "TRANSIT",
            );
            const summary = summarizeTransitSteps(parsed);
            transferCount = summary.transferCount;
            walkingMeters = summary.walkingMeters;
          } catch {
            /* malformed cache — skip detail */
          }
        }

        let flight: PdfFlightInfo | null = null;
        if (t.mode === "FLIGHT" && t.metadataJson) {
          try {
            const m = JSON.parse(t.metadataJson) as Record<string, unknown>;
            flight = {
              flightNumber: typeof m.flightNumber === "string" ? m.flightNumber : null,
              airline: typeof m.airline === "string" ? m.airline : null,
              depAirport: typeof m.depAirport === "string" ? m.depAirport : null,
              arrAirport: typeof m.arrAirport === "string" ? m.arrAirport : null,
              depTime: typeof m.depTime === "string" ? m.depTime : null,
              arrTime: typeof m.arrTime === "string" ? m.arrTime : null,
              arrDateOffset: typeof m.arrDateOffset === "number" ? m.arrDateOffset : null,
              terminal: typeof m.terminal === "string" ? m.terminal : null,
              seatNumber: typeof m.seatNumber === "string" ? m.seatNumber : null,
              isInternational:
                typeof m.isInternational === "boolean" ? m.isInternational : null,
            };
          } catch {
            /* ignore */
          }
        }

        return {
          fromItemId: t.fromScheduleItemId,
          toItemId: t.toScheduleItemId,
          mode: t.mode,
          distanceM: t.distanceMeters ?? 0,
          durationSec: t.durationSec ?? 0,
          fareAmount: t.fareAmount ?? null,
          fareCurrency: t.fareCurrency ?? null,
          transitLine: t.transitLine ?? null,
          transitSteps,
          transferCount,
          walkingMeters,
          flight,
        };
      });
    return {
      id: d.id,
      dayIndex: d.dayIndex,
      date: d.date.toISOString().slice(0, 10),
      weekday: WEEKDAYS[d.date.getDay()] ?? "",
      items,
      transports,
    };
  });

  // Cost aggregation (only for chosen plan)
  const planExpenses = trip.expenses.filter((e) => e.planId === plan.id);
  const breakdown = { food: 0, lodging: 0, transport: 0, ticket: 0, misc: 0 };
  let total = 0;
  const expenses: PdfExpense[] = planExpenses.map((e) => {
    const inBase = e.fxRateToBase && e.currency !== trip.baseCurrency
      ? e.amount / e.fxRateToBase
      : e.amount;
    total += inBase;
    if (e.category === "FOOD") breakdown.food += inBase;
    else if (e.category === "LODGING") breakdown.lodging += inBase;
    else if (e.category === "TRANSPORT") breakdown.transport += inBase;
    else if (e.category === "TICKET") breakdown.ticket += inBase;
    else breakdown.misc += inBase;
    return {
      id: e.id,
      category: e.category,
      note: e.note,
      amount: e.amount,
      currency: e.currency,
      amountInBase: inBase,
    };
  });

  // AI suggestions — pick latest per kind
  const aiByKind = new Map<string, typeof plan.aiSuggestions[number]>();
  for (const a of plan.aiSuggestions) {
    if (!aiByKind.has(a.kind)) aiByKind.set(a.kind, a);
  }
  const ai: PdfAiSection[] = [];
  for (const [kind, latest] of aiByKind) {
    let bullets: { zh: string; en: string }[] = [];
    try {
      const parsed = JSON.parse(latest.output);
      const candidates =
        (Array.isArray(parsed?.bullets) && parsed.bullets) ||
        (Array.isArray(parsed?.items) && parsed.items) ||
        (Array.isArray(parsed) ? parsed : []);
      bullets = (candidates as { zh?: string; en?: string }[]).map((b) => ({
        zh: b.zh ?? "",
        en: b.en ?? "",
      }));
    } catch {
      /* ignore */
    }
    ai.push({
      category: kind,
      zhTitle:
        kind === "PRE_TRIP_NOTES"
          ? "行前注意事項"
          : kind === "PACKING_CHECKLIST"
            ? "行李 Checklist"
            : "AI 建議",
      enTitle:
        kind === "PRE_TRIP_NOTES"
          ? "Pre-Trip Notes"
          : kind === "PACKING_CHECKLIST"
            ? "Packing Checklist"
            : "AI Suggestions",
      bullets,
    });
  }

  return {
    tripId: trip.id,
    title: trip.title,
    subtitle: trip.subtitle ?? "",
    destination: trip.destination ?? "",
    startDate: trip.startDate.toISOString().slice(0, 10),
    endDate: trip.endDate.toISOString().slice(0, 10),
    totalDays: plan.days.length,
    baseCurrency: trip.baseCurrency,
    localCurrency: settings.localCurrency,
    fxRates: settings.fxRates,
    planName: plan.name,
    pace: plan.pace,
    totalCost: Math.round(total),
    costBreakdown: {
      food: Math.round(breakdown.food),
      lodging: Math.round(breakdown.lodging),
      transport: Math.round(breakdown.transport),
      ticket: Math.round(breakdown.ticket),
      misc: Math.round(breakdown.misc),
    },
    totalDistanceKm: Math.round(totalDistanceM / 1000),
    places,
    days,
    expenses,
    tickets,
    ai,
  };
}
