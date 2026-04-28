import "server-only";
import { prisma } from "@/lib/db";
import type { PlaceIconKey } from "@/lib/place-icon";

// Aggregate query for /trips/[tripId] — returns everything the editor + map +
// floating card need in a single round-trip.

export type EditorPlace = {
  id: string;            // googlePlaceId
  name: string;
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

export type EditorScheduleItem = {
  id: string;
  kind: "ATTRACTION" | "MEAL" | "LODGING" | "FREE" | "TRANSPORT_STOP";
  placeId: string | null;
  startTime: string;
  endTime: string;
  durationMin: number;
  isAllDay: boolean;
  isTimeLocked: boolean;
  orderIndex: number;
  hasTicket: boolean;
  note: string | null;
};

export type EditorTransport = {
  fromItemId: string;
  toItemId: string;
  mode: "DRIVING" | "TRANSIT" | "WALKING";
  distanceM: number;
  durationSec: number;
  estimatedCost: number | null;
  needsParking: boolean;
};

export type EditorDay = {
  id: string;
  date: string;
  dayIndex: number;
  weekday: string;
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
  defaultPlanId: string | null;
  plans: EditorPlan[];
  days: EditorDay[];                     // belongs to default plan (one per Trip view)
  daysByPlanId: Record<string, EditorDay[]>; // for compare mode
  places: Record<string, EditorPlace>;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export async function loadEditorTrip(tripId: string): Promise<EditorTrip | null> {
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
                  outgoingTransport: true,
                  tickets: { select: { id: true } },
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
      const items: EditorScheduleItem[] = day.scheduleItems.map((it) => ({
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
      }));
      const transports: EditorTransport[] = day.scheduleItems
        .map((it) => it.outgoingTransport)
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({
          fromItemId: t.fromScheduleItemId,
          toItemId: t.toScheduleItemId,
          mode: t.mode as EditorTransport["mode"],
          distanceM: t.distanceMeters ?? 0,
          durationSec: t.durationSec ?? 0,
          estimatedCost: t.estimatedCost,
          needsParking: t.mode === "DRIVING",
        }));

      const d = day.date;
      return {
        id: day.id,
        date: d.toISOString().slice(0, 10),
        dayIndex: day.dayIndex,
        weekday: WEEKDAYS[d.getDay()],
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
    defaultPlanId,
    plans,
    days,
    daysByPlanId,
    places,
  };
}
