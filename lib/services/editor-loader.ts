import "server-only";
import { prisma } from "@/lib/db";
import type { PlaceIconKey } from "@/lib/place-icon";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { canViewTrip } from "./share-service";
import { parseTransitSteps } from "./directions-service";

// Aggregate query for /trips/[tripId] — returns everything the editor + map +
// floating card need in a single round-trip.

// Compare page payload — lighter, only what the comparison tables need.
export type ComparePlanRow = {
  id: string;
  name: string;
  pace: string;
  description: string;
  isDefault: boolean;
  totalCost: number;
  totalDistanceKm: number;
  totalDays: number;
  costBreakdown: { food: number; lodging: number; transport: number; ticket: number; misc: number };
  // Per-day intensity (count of timed items per day)
  dayIntensity: number[];
};

export type CompareDay = {
  id: string;
  dayIndex: number;
  date: string;
  weekday: string;
};

export type CompareTripData = {
  tripId: string;
  tripTitle: string;
  baseCurrency: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  plans: ComparePlanRow[];
  days: CompareDay[];
};

export async function loadCompareTrip(tripId: string): Promise<CompareTripData | null> {
  // Gate by access (owner OR active TripMember). Without this, only the
  // owner could open a shared trip.
  if (!(await canViewTrip(tripId))) return null;
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      plans: {
        orderBy: { displayOrder: "asc" },
        include: {
          days: {
            orderBy: { dayIndex: "asc" },
            include: {
              scheduleItems: {
                where: { isAllDay: false },
                select: { id: true, outgoingTransport: { select: { distanceMeters: true } } },
              },
            },
          },
        },
      },
      expenses: { select: { planId: true, category: true, amount: true, fxRateToBase: true, currency: true } },
    },
  });
  if (!trip) return null;

  const totalsByPlan = new Map<string, { food: number; lodging: number; transport: number; ticket: number; misc: number; total: number }>();
  for (const e of trip.expenses) {
    const inBase = e.fxRateToBase && e.currency !== trip.baseCurrency
      ? e.amount / e.fxRateToBase
      : e.amount;
    const cur = totalsByPlan.get(e.planId) ?? { food: 0, lodging: 0, transport: 0, ticket: 0, misc: 0, total: 0 };
    cur.total += inBase;
    if (e.category === "FOOD") cur.food += inBase;
    else if (e.category === "LODGING") cur.lodging += inBase;
    else if (e.category === "TRANSPORT") cur.transport += inBase;
    else if (e.category === "TICKET") cur.ticket += inBase;
    else cur.misc += inBase;
    totalsByPlan.set(e.planId, cur);
  }

  const plans: ComparePlanRow[] = trip.plans.map((p) => {
    const t = totalsByPlan.get(p.id) ?? { food: 0, lodging: 0, transport: 0, ticket: 0, misc: 0, total: 0 };
    let distance = 0;
    const dayIntensity: number[] = [];
    for (const d of p.days) {
      dayIntensity.push(d.scheduleItems.length);
      for (const it of d.scheduleItems) {
        if (it.outgoingTransport?.distanceMeters) distance += it.outgoingTransport.distanceMeters;
      }
    }
    return {
      id: p.id,
      name: p.name,
      pace: p.pace,
      description: p.description ?? "",
      isDefault: trip.defaultPlanId === p.id,
      totalCost: Math.round(t.total),
      totalDistanceKm: Math.round(distance / 1000),
      totalDays: p.days.length,
      costBreakdown: {
        food: Math.round(t.food),
        lodging: Math.round(t.lodging),
        transport: Math.round(t.transport),
        ticket: Math.round(t.ticket),
        misc: Math.round(t.misc),
      },
      dayIntensity,
    };
  });

  // Use the default (or first) plan's days as the canonical day list for scope.
  const defaultPlan = trip.plans.find((p) => p.id === trip.defaultPlanId) ?? trip.plans[0];
  const days: CompareDay[] = (defaultPlan?.days ?? []).map((d) => ({
    id: d.id,
    dayIndex: d.dayIndex,
    date: d.date.toISOString().slice(0, 10),
    weekday: WEEKDAYS[d.date.getDay()],
  }));

  return {
    tripId: trip.id,
    tripTitle: trip.title,
    baseCurrency: trip.baseCurrency,
    startDate: trip.startDate.toISOString().slice(0, 10),
    endDate: trip.endDate.toISOString().slice(0, 10),
    totalDays: plans[0]?.totalDays ?? 0,
    plans,
    days,
  };
}

export type EditorPlace = {
  id: string;            // googlePlaceId
  name: string;          // = userEditedName ?? originalName (denormalized cache)
  // Phase 12a — user override + canonical Google name. Both surfaced so the
  // editor can render a "revert" button when an override is active.
  userEditedName: string | null;
  originalName: string;
  category: string;
  address: string;
  rating: number;
  ratingCount: number;
  iconKey: PlaceIconKey;
  defaultStayMinutes: number;
  reviewSnippet: string;
  mapX: number;
  mapY: number;
  lat: number | null;
  lng: number | null;
};

export type EditorScheduleItemKind =
  | "ATTRACTION"
  | "MEAL"
  | "LODGING"
  | "FREE"
  | "TRANSPORT_STOP"
  | "FLIGHT"
  | "CAR_RENTAL"
  | "TRAIN";

export type EditorScheduleItem = {
  id: string;
  kind: EditorScheduleItemKind;
  placeId: string | null;
  startTime: string;
  endTime: string;
  durationMin: number;
  isAllDay: boolean;
  isTimeLocked: boolean;
  orderIndex: number;
  hasTicket: boolean;
  note: string | null;
  // Phase 10c — kind-specific structured fields. Validated by
  // schedule-item-metadata.ts schemas in the FloatingPlaceCard edit form.
  metadata: Record<string, unknown> | null;
  // Phase 10d — points to its parent FLIGHT scheduleItem when this is a
  // check-in / immigration helper item.
  parentFlightScheduleItemId: string | null;
  // Phase 10b — photo count (full data lazy-loaded by the card)
  photoCount: number;
};

export type EditorTransport = {
  id: string;
  fromItemId: string;
  toItemId: string;
  mode: "DRIVING" | "TRANSIT" | "WALKING" | "BICYCLING" | "CUSTOM" | "FLIGHT" | "TAXI";
  // Phase 10i — kind-specific structured fields (currently only FLIGHT writes here)
  metadata: Record<string, unknown> | null;
  // Phase 11 — Maps-style picker cache (full RouteOption[] snapshot).
  // V2 dialog renders from this on open without re-querying Routes API.
  routeOptionsJson: string | null;
  selectedOptionId: string | null;
  // Phase 11.6 — Google-Maps-style line color for TRANSIT segments.
  // Pulled from the FIRST transit step's lineColor (e.g. JR山手線 = #9ACD32).
  // Map panels use this to override the generic mode color when present.
  displayColor: string | null;
  distanceM: number;
  durationSec: number;
  estimatedCost: number | null;
  needsParking: boolean;
  manuallyEdited: boolean;
  notes: string | null;
  transitLine: string | null;
  transitDetailsJson: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
  aiGeneratedAt: string | null;
  parkingPlaceId: string | null;
  parkingPlaceName: string | null;
  // Phase 9 — Google Routes API cached fields
  encodedPolyline: string | null;
  fareCurrency: string | null;
  fareAmount: number | null;
  trafficLevel: "light" | "moderate" | "heavy" | null;
  directionsFetchedAt: string | null;
  hasModesSummary: boolean;
  // Phase 12a — free state for cascade engine (no concrete mode/duration yet).
  isFree: boolean;
  // Phase 12b — rich step-by-step transit timeline (raw JSON string).
  transitStepsJson: string | null;
  // Phase 12c — DRIVING-only segment breakdown JSON (tier-2 LLM result cache).
  drivingSegmentsJson: string | null;
};

export type EditorDay = {
  id: string;
  date: string;
  dayIndex: number;
  weekday: string;
  // Phase 12f — monotonic version for optimistic-concurrency check during
  // batched week-view edits.
  version: number;
  items: EditorScheduleItem[];
  transports: EditorTransport[];
};

export type EditorPlan = {
  id: string;
  name: string;
  pace: string;
  description: string;
  isDefault: boolean;
  totalCost: number;
  totalDistanceKm: number;
  totalDurationHours: number;
  costBreakdown: { food: number; lodging: number; transport: number; ticket: number; misc: number };
};

export type EditorTrip = {
  id: string;
  title: string;
  subtitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  baseCurrency: string;
  defaultPlanId: string | null;
  plans: EditorPlan[];
  days: EditorDay[];                     // belongs to default plan (one per Trip view)
  daysByPlanId: Record<string, EditorDay[]>; // for compare mode
  places: Record<string, EditorPlace>;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export async function loadEditorTrip(tripId: string): Promise<EditorTrip | null> {
  if (!(await canViewTrip(tripId))) return null;
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      plans: {
        orderBy: { displayOrder: "asc" },
        include: {
          days: {
            orderBy: { dayIndex: "asc" },
            include: {
              scheduleItems: {
                orderBy: [{ isAllDay: "desc" }, { orderIndex: "asc" }],
                include: {
                  place: true,
                  outgoingTransport: { include: { parkingPlace: true } },
                  tickets: { select: { id: true } },
                  _count: { select: { photos: true } },
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

  // Collect Place rows referenced anywhere
  const placeIds = new Set<string>();
  for (const plan of trip.plans) {
    for (const day of plan.days) {
      for (const item of day.scheduleItems) if (item.placeId) placeIds.add(item.placeId);
    }
  }
  const placeRows = await prisma.place.findMany({
    where: { googlePlaceId: { in: [...placeIds] } },
  });
  const places: Record<string, EditorPlace> = {};
  for (const p of placeRows) {
    places[p.googlePlaceId] = {
      id: p.googlePlaceId,
      name: p.name,
      userEditedName: p.userEditedName,
      originalName: p.originalName,
      category: p.category,
      address: p.address ?? "",
      rating: p.rating ?? 0,
      ratingCount: p.ratingCount ?? 0,
      iconKey: (p.iconKey as PlaceIconKey) ?? "landmark",
      defaultStayMinutes: p.defaultStayMinutes,
      reviewSnippet: p.reviewSnippet ?? "",
      mapX: p.mapX ?? 0,
      mapY: p.mapY ?? 0,
      lat: p.lat,
      lng: p.lng,
    };
  }

  const totalsByPlan = new Map<string, { total: number; food: number; lodging: number; transport: number; ticket: number; misc: number }>();
  for (const e of trip.expenses) {
    const t = totalsByPlan.get(e.planId) ?? { total: 0, food: 0, lodging: 0, transport: 0, ticket: 0, misc: 0 };
    t.total += e.amount;
    if (e.category === "FOOD") t.food += e.amount;
    else if (e.category === "LODGING") t.lodging += e.amount;
    else if (e.category === "TRANSPORT") t.transport += e.amount;
    else if (e.category === "TICKET") t.ticket += e.amount;
    else t.misc += e.amount;
    totalsByPlan.set(e.planId, t);
  }

  const plans: EditorPlan[] = trip.plans.map((p) => {
    const t = totalsByPlan.get(p.id) ?? { total: 0, food: 0, lodging: 0, transport: 0, ticket: 0, misc: 0 };
    return {
      id: p.id,
      name: p.name,
      pace: p.pace,
      description: p.description ?? "",
      isDefault: trip.defaultPlanId === p.id,
      totalCost: t.total,
      totalDistanceKm: 0,    // computed lazily once we have transports
      totalDurationHours: 0,
      costBreakdown: { food: t.food, lodging: t.lodging, transport: t.transport, ticket: t.ticket, misc: t.misc },
    };
  });

  const daysByPlanId: Record<string, EditorDay[]> = {};
  for (const plan of trip.plans) {
    daysByPlanId[plan.id] = plan.days.map((day) => {
      const items: EditorScheduleItem[] = day.scheduleItems.map((it) => {
        let metadata: Record<string, unknown> | null = null;
        if (it.metadataJson) {
          try {
            const o = JSON.parse(it.metadataJson);
            if (o && typeof o === "object") metadata = o as Record<string, unknown>;
          } catch {
            /* ignore malformed metadata JSON */
          }
        }
        return {
          id: it.id,
          kind: it.kind as EditorScheduleItem["kind"],
          placeId: it.placeId,
          startTime: it.startTime,
          endTime: it.endTime,
          durationMin: it.durationMin,
          isAllDay: it.isAllDay,
          isTimeLocked: it.isTimeLocked,
          orderIndex: it.orderIndex,
          hasTicket: it.tickets.length > 0,
          note: it.note,
          metadata,
          parentFlightScheduleItemId: it.parentFlightScheduleItemId ?? null,
          photoCount: (it as { _count?: { photos?: number } })._count?.photos ?? 0,
        };
      });
      const transports: EditorTransport[] = day.scheduleItems
        .map((it) => it.outgoingTransport)
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({
          id: t.id,
          fromItemId: t.fromScheduleItemId,
          toItemId: t.toScheduleItemId,
          mode: t.mode as EditorTransport["mode"],
          distanceM: t.distanceMeters ?? 0,
          durationSec: t.durationSec ?? 0,
          estimatedCost: t.estimatedCost,
          needsParking: t.mode === "DRIVING",
          manuallyEdited: t.manuallyEdited,
          notes: t.notes,
          transitLine: t.transitLine,
          transitDetailsJson: t.transitDetailsJson,
          originLabel: t.originLabel,
          destinationLabel: t.destinationLabel,
          aiGeneratedAt: t.aiGeneratedAt?.toISOString() ?? null,
          parkingPlaceId: t.parkingPlaceId,
          parkingPlaceName: t.parkingPlace?.name ?? null,
          encodedPolyline: t.encodedPolyline,
          fareCurrency: t.fareCurrency,
          fareAmount: t.fareAmount,
          trafficLevel: (t.trafficLevel as "light" | "moderate" | "heavy" | null) ?? null,
          directionsFetchedAt: t.directionsFetchedAt?.toISOString() ?? null,
          hasModesSummary: !!t.modesSummaryJson,
          metadata: (() => {
            if (!t.metadataJson) return null;
            try {
              const o = JSON.parse(t.metadataJson);
              return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
            } catch {
              return null;
            }
          })(),
          routeOptionsJson: t.routeOptionsJson,
          selectedOptionId: t.selectedOptionId,
          displayColor: deriveTransportDisplayColor(t),
          isFree: t.isFree,
          transitStepsJson: t.transitStepsJson,
          drivingSegmentsJson: t.drivingSegmentsJson,
        }));

      const d = day.date;
      return {
        id: day.id,
        date: d.toISOString().slice(0, 10),
        dayIndex: day.dayIndex,
        weekday: WEEKDAYS[d.getDay()],
        version: day.version,
        items,
        transports,
      };
    });
  }

  const defaultPlanId = trip.defaultPlanId ?? trip.plans[0]?.id ?? "";
  const days = daysByPlanId[defaultPlanId] ?? [];

  return {
    id: trip.id,
    title: trip.title,
    subtitle: trip.subtitle ?? "",
    destination: trip.destination ?? "",
    startDate: trip.startDate.toISOString().slice(0, 10),
    endDate: trip.endDate.toISOString().slice(0, 10),
    baseCurrency: trip.baseCurrency,
    defaultPlanId,
    plans,
    days,
    daysByPlanId,
    places,
  };
}

// Phase 11.6 — derive a Google-Maps-style line color for the polyline.
// For TRANSIT mode, look at the cached directions response and pull the
// FIRST transit step's lineColor (e.g. 山手線 = #9ACD32, 銀座線 = #FF9500).
// Falls back to null → map panel uses the generic mode color.
function deriveTransportDisplayColor(t: {
  mode: string;
  directionsCacheJson: string | null;
}): string | null {
  if (t.mode !== "TRANSIT" || !t.directionsCacheJson) return null;
  try {
    const steps = parseTransitSteps(JSON.parse(t.directionsCacheJson));
    for (const s of steps) {
      if (s.kind === "TRANSIT" && s.lineColor) {
        // Google sometimes returns "FF9500" without #; normalize.
        const c = s.lineColor.startsWith("#") ? s.lineColor : `#${s.lineColor}`;
        return c;
      }
    }
  } catch {
    /* malformed cache; ignore */
  }
  return null;
}
