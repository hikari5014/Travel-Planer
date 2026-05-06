import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolvePlaceIcon, type PlaceIconKey } from "@/lib/place-icon";
import { suggestStayMinutes } from "./heuristic-stay";
import { recalcDayTransports } from "./transport-service";
import { lookupAirport } from "@/lib/iata-airports";
import type { PlaceSearchResult } from "./place-service";
import { upsertPlaceFromGoogle } from "./place-service";

// Phase 14c — kind-aware add-item service.
//
// Each kind has a tailored submit function that:
//   1. Upserts 1+ Place rows (custom or Google Places hit)
//   2. Creates 1+ ScheduleItem rows on the right Day(s) with full metadata
//   3. Triggers expandFlightSchedule for FLIGHT (auto buddies)
//   4. Recalcs transports + cascades times
//   5. Recalcs auto-Expense rows
//
// Returns the new "primary" ScheduleItem id so the caller can navigate /
// open the FloatingPlaceCard for it.

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseHM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}
function fmtHM(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function genLocalPlaceId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function findOrCreateDayByDate(
  tripId: string,
  isoDate: string,
): Promise<string> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { defaultPlanId: true, plans: { select: { id: true } } },
  });
  if (!trip) throw new Error("找不到 Trip");
  const planId = trip.defaultPlanId ?? trip.plans[0]?.id;
  if (!planId) throw new Error("Trip 沒有預設方案");

  const target = new Date(isoDate + "T00:00:00Z");
  const existing = await prisma.day.findFirst({
    where: {
      planId,
      date: { gte: new Date(target.getTime() - 1), lt: new Date(target.getTime() + 86400000) },
    },
  });
  if (existing) return existing.id;

  // Append a new Day at next index
  const last = await prisma.day.findFirst({
    where: { planId },
    orderBy: { dayIndex: "desc" },
    select: { dayIndex: true },
  });
  const created = await prisma.day.create({
    data: { planId, dayIndex: (last?.dayIndex ?? 0) + 1, date: target },
  });
  return created.id;
}

async function nextOrderIndex(dayId: string): Promise<number> {
  const last = await prisma.scheduleItem.findFirst({
    where: { dayId, isAllDay: false },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  return (last?.orderIndex ?? 0) + 1;
}

// Upsert a custom Place from { name, lat, lng, ... } with a local-* id.
async function upsertCustomPlace(input: {
  googlePlaceId?: string;
  name: string;
  category?: string;
  iconKey?: PlaceIconKey;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  ratingCount?: number;
  defaultStayMinutes?: number;
}): Promise<string> {
  const id = input.googlePlaceId ?? genLocalPlaceId();
  const cat = input.category ?? "其他";
  const ik = (input.iconKey ?? resolvePlaceIcon(cat)) as PlaceIconKey;
  const stay = input.defaultStayMinutes ?? suggestStayMinutes(ik) ?? 60;
  await prisma.place.upsert({
    where: { googlePlaceId: id },
    update: {
      name: input.name,
      originalName: input.name,
      category: cat,
      address: input.address ?? null,
      iconKey: ik,
      rating: input.rating ?? null,
      ratingCount: input.ratingCount ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      fetchedAt: new Date(),
    },
    create: {
      googlePlaceId: id,
      name: input.name,
      originalName: input.name,
      category: cat,
      address: input.address ?? null,
      iconKey: ik,
      rating: input.rating ?? null,
      ratingCount: input.ratingCount ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      defaultStayMinutes: stay,
      defaultStaySource: "HEURISTIC",
      fetchedAt: new Date(),
    },
  });
  return id;
}

// ─── FLIGHT ────────────────────────────────────────────────────────────────

// Phase 14i — Google Places hit shape accepted by addFlight (and the
// trip-import path). Subset of PlaceSearchResult; we only need the fields
// upsertPlaceFromGoogle reads.
const googlePlaceLite = z.object({
  googlePlaceId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().default("機場"),
  address: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  ratingCount: z.number().nullable().optional(),
  iconKey: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type GooglePlaceLite = z.infer<typeof googlePlaceLite>;

export const addFlightInput = z.object({
  tripId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  flightNumber: z.string().min(1).max(20),
  airline: z.string().nullable().optional(),
  depAirport: z.string().min(2).max(5), // IATA
  arrAirport: z.string().min(2).max(5),
  depTime: z.string().regex(/^\d{2}:\d{2}$/),
  arrTime: z.string().regex(/^\d{2}:\d{2}$/),
  arrDateOffset: z.number().int().min(0).max(2).optional(),
  depTerminal: z.string().nullable().optional(),
  arrTerminal: z.string().nullable().optional(),
  isInternational: z.boolean().optional(),
  checkInBufferMin: z.number().int().min(0).max(600).optional(),
  immigrationBufferMin: z.number().int().min(0).max(600).optional(),
  ticketPrice: z.number().nonnegative().nullable().optional(),
  ticketCurrency: z.string().length(3).nullable().optional(),
  bookingRef: z.string().nullable().optional(),
  seatNumber: z.string().nullable().optional(),
  aircraftType: z.string().nullable().optional(),
  baggageAllowance: z.string().nullable().optional(),
  mealNote: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Phase 14i — optional Google Places hits per airport (preferred over IATA
  // table when supplied; gives the airport item a real rating / lat-lng /
  // photo so FloatingPlaceCard can render it normally).
  depGooglePlace: googlePlaceLite.nullable().optional(),
  arrGooglePlace: googlePlaceLite.nullable().optional(),
});
export type AddFlightInput = z.infer<typeof addFlightInput>;

// Resolve a Place row id for an airport: Google hit > built-in IATA > local stub.
async function resolveAirportPlaceId(
  iata: string,
  google: GooglePlaceLite | null | undefined,
): Promise<string> {
  const codeUpper = iata.toUpperCase();
  if (google) {
    await upsertPlaceFromGoogle({
      googlePlaceId: google.googlePlaceId,
      name: google.name,
      category: google.category ?? "機場",
      address: google.address ?? null,
      rating: google.rating ?? null,
      ratingCount: google.ratingCount ?? undefined,
      iconKey: (google.iconKey as PlaceIconKey | undefined) ?? "airport",
      source: "google",
      lat: google.lat,
      lng: google.lng,
    });
    return google.googlePlaceId;
  }
  const fallback = lookupAirport(codeUpper);
  return upsertCustomPlace({
    googlePlaceId: `airport-${codeUpper}`,
    name: fallback?.name ?? `${codeUpper} 機場`,
    category: "機場",
    iconKey: "airport" as PlaceIconKey,
    lat: fallback?.lat,
    lng: fallback?.lng,
  });
}

// Phase 14i — extracted from addFlight so trip-import can reuse it.
// Creates 2 FLIGHT ScheduleItems (departure + arrival airport) and a single
// FLIGHT-mode Transport between them. No CHECK-IN / IMMIGRATION buddies —
// that buffer info lives on the dep item's metadata for the FloatingPlaceCard.
// The Transport is marked manuallyEdited so cascade won't replace it with a
// WALK fallback.
export type FlightSegmentInput = {
  dayId: string;
  date: string; // dep ISO date (for arrDateOffset → arrDate)
  flightNumber: string;
  airline?: string | null;
  depAirport: string;
  arrAirport: string;
  depTime: string;
  arrTime: string;
  arrDateOffset?: number;
  depTerminal?: string | null;
  arrTerminal?: string | null;
  isInternational?: boolean | null;
  checkInBufferMin?: number | null;
  immigrationBufferMin?: number | null;
  ticketPrice?: number | null;
  ticketCurrency?: string | null;
  bookingRef?: string | null;
  seatNumber?: string | null;
  aircraftType?: string | null;
  baggageAllowance?: string | null;
  mealNote?: string | null;
  notes?: string | null;
  depGooglePlace?: GooglePlaceLite | null;
  arrGooglePlace?: GooglePlaceLite | null;
};

export async function createFlightSegmentAtDay(
  input: FlightSegmentInput,
): Promise<{ depItemId: string; arrItemId: string }> {
  const depPlaceId = await resolveAirportPlaceId(input.depAirport, input.depGooglePlace);
  const arrPlaceId = await resolveAirportPlaceId(input.arrAirport, input.arrGooglePlace);

  const dep = parseHM(input.depTime);
  const arr = parseHM(input.arrTime);
  const offset = input.arrDateOffset ?? 0;
  const durationMin = Math.max(0, arr + offset * 24 * 60 - dep);

  const meta = {
    flightNumber: input.flightNumber,
    airline: input.airline ?? null,
    depAirport: input.depAirport.toUpperCase(),
    arrAirport: input.arrAirport.toUpperCase(),
    depTime: input.depTime,
    arrTime: input.arrTime,
    arrDate: offset > 0 ? addDays(input.date, offset) : null,
    arrDateOffset: offset,
    terminal: input.depTerminal ?? null,
    arrTerminal: input.arrTerminal ?? null,
    isInternational: input.isInternational ?? null,
    checkInBufferMin: input.checkInBufferMin ?? null,
    immigrationBufferMin: input.immigrationBufferMin ?? null,
    ticketPrice: input.ticketPrice ?? null,
    ticketCurrency: input.ticketCurrency ?? null,
    bookingRef: input.bookingRef ?? null,
    seatNumber: input.seatNumber ?? null,
    aircraftType: input.aircraftType ?? null,
    baggageAllowance: input.baggageAllowance ?? null,
    mealNote: input.mealNote ?? null,
    arrAirportPlaceId: arrPlaceId,
  };
  // Arrival item carries a stripped meta — enough context for the row but
  // no ticketPrice (would double-count in expense-service).
  const arrMeta = {
    flightNumber: input.flightNumber,
    airline: input.airline ?? null,
    depAirport: input.depAirport.toUpperCase(),
    arrAirport: input.arrAirport.toUpperCase(),
    depTime: input.depTime,
    arrTime: input.arrTime,
    arrTerminal: input.arrTerminal ?? null,
    derivedFromFlightItemId: null as string | null, // filled after dep item exists
  };

  // Phase 14m — the dep item now spans (depTime - checkInBuffer) → depTime,
  // representing "arrive at airport + check in" before the flight. The arr
  // item spans arrTime → (arrTime + immigrationBuffer), representing the
  // landing + immigration + baggage window. This makes the schedule list
  // correctly block out the full flight-day footprint.
  const checkInBuf = Math.max(0, input.checkInBufferMin ?? 0);
  const immigrationBuf = Math.max(0, input.immigrationBufferMin ?? 0);
  const depItemStart = fmtHM(parseHM(input.depTime) - checkInBuf);
  const arrItemEnd = fmtHM(parseHM(input.arrTime) + immigrationBuf);

  const orderBase = await nextOrderIndex(input.dayId);
  const depItem = await prisma.scheduleItem.create({
    data: {
      dayId: input.dayId,
      placeId: depPlaceId,
      kind: "FLIGHT",
      startTime: depItemStart,
      endTime: input.depTime,
      durationMin: checkInBuf,
      suggestedDurationMin: checkInBuf,
      orderIndex: orderBase,
      isAllDay: false,
      isTimeLocked: true,
      note: input.notes ?? null,
      metadataJson: JSON.stringify(meta),
    },
  });
  arrMeta.derivedFromFlightItemId = depItem.id;
  const arrItem = await prisma.scheduleItem.create({
    data: {
      dayId: input.dayId,
      placeId: arrPlaceId,
      kind: "FLIGHT",
      startTime: input.arrTime,
      endTime: arrItemEnd,
      durationMin: immigrationBuf,
      suggestedDurationMin: immigrationBuf,
      orderIndex: orderBase + 1,
      isAllDay: false,
      isTimeLocked: true,
      metadataJson: JSON.stringify(arrMeta),
    },
  });
  // Direct FLIGHT-mode transport between the two airport items. manuallyEdited
  // ensures recalcDayTransports keeps it intact (no WALK fallback).
  await prisma.transport.create({
    data: {
      fromScheduleItemId: depItem.id,
      toScheduleItemId: arrItem.id,
      mode: "FLIGHT",
      distanceMeters: 0,
      durationSec: durationMin * 60,
      isFree: false,
      manuallyEdited: true,
      metadataJson: JSON.stringify({
        flightNumber: input.flightNumber,
        airline: input.airline ?? null,
        depAirport: input.depAirport.toUpperCase(),
        arrAirport: input.arrAirport.toUpperCase(),
        depTime: input.depTime,
        arrTime: input.arrTime,
        seatNumber: input.seatNumber ?? null,
      }),
    },
  });
  return { depItemId: depItem.id, arrItemId: arrItem.id };
}

export async function addFlight(input: AddFlightInput): Promise<string> {
  const parsed = addFlightInput.parse(input);
  const dayId = await findOrCreateDayByDate(parsed.tripId, parsed.date);
  const { depItemId } = await createFlightSegmentAtDay({
    dayId,
    date: parsed.date,
    flightNumber: parsed.flightNumber,
    airline: parsed.airline,
    depAirport: parsed.depAirport,
    arrAirport: parsed.arrAirport,
    depTime: parsed.depTime,
    arrTime: parsed.arrTime,
    arrDateOffset: parsed.arrDateOffset,
    depTerminal: parsed.depTerminal,
    arrTerminal: parsed.arrTerminal,
    isInternational: parsed.isInternational,
    checkInBufferMin: parsed.checkInBufferMin,
    immigrationBufferMin: parsed.immigrationBufferMin,
    ticketPrice: parsed.ticketPrice,
    ticketCurrency: parsed.ticketCurrency,
    bookingRef: parsed.bookingRef,
    seatNumber: parsed.seatNumber,
    aircraftType: parsed.aircraftType,
    baggageAllowance: parsed.baggageAllowance,
    mealNote: parsed.mealNote,
    notes: parsed.notes,
    depGooglePlace: parsed.depGooglePlace,
    arrGooglePlace: parsed.arrGooglePlace,
  });
  await recalcDayTransports(dayId);
  return depItemId;
}

// ─── LODGING ────────────────────────────────────────────────────────────────

export const addLodgingInput = z.object({
  tripId: z.string(),
  hotel: z.object({
    googlePlace: z.unknown().nullable().optional(),
    name: z.string().min(1).max(120),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    rating: z.number().optional(),
    ratingCount: z.number().optional(),
    iconKey: z.string().optional(),
  }),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  guestCount: z.number().int().min(1).max(20).optional(),
  totalCost: z.number().nonnegative().nullable().optional(),
  ticketCurrency: z.string().length(3).nullable().optional(),
  bookingPlatform: z.string().nullable().optional(),
  bookingRef: z.string().nullable().optional(),
  breakfastIncluded: z.boolean().optional(),
  parkingAvailable: z.boolean().optional(),
  parkingFeePerNight: z.number().nonnegative().nullable().optional(),
  wifiPassword: z.string().nullable().optional(),
  cancellationPolicy: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AddLodgingInput = z.infer<typeof addLodgingInput>;

export async function addLodging(input: AddLodgingInput): Promise<string> {
  const parsed = addLodgingInput.parse(input);
  const start = new Date(parsed.checkInDate + "T00:00:00Z");
  const end = new Date(parsed.checkOutDate + "T00:00:00Z");
  const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));

  // Hotel place
  let placeId: string;
  if (parsed.hotel.googlePlace) {
    const gp = parsed.hotel.googlePlace as PlaceSearchResult;
    await upsertPlaceFromGoogle(gp);
    placeId = gp.googlePlaceId;
  } else {
    placeId = await upsertCustomPlace({
      name: parsed.hotel.name,
      category: "住宿",
      iconKey: (parsed.hotel.iconKey as PlaceIconKey) ?? "hotel",
      address: parsed.hotel.address,
      lat: parsed.hotel.lat,
      lng: parsed.hotel.lng,
      rating: parsed.hotel.rating,
      ratingCount: parsed.hotel.ratingCount,
    });
  }

  // Create one all-day LODGING ScheduleItem per night. First night owns
  // totalCost expense (per Phase 14a expense-service).
  const dayIds: string[] = [];
  let firstItemId: string | null = null;
  for (let i = 0; i < nights; i++) {
    const dateIso = addDays(parsed.checkInDate, i);
    const dayId = await findOrCreateDayByDate(parsed.tripId, dateIso);
    dayIds.push(dayId);
    const orderIndex = (await nextOrderIndex(dayId)) - 1; // pin all-day first
    const meta = {
      checkInTime: parsed.checkInTime ?? "15:00",
      checkOutTime: parsed.checkOutTime ?? "11:00",
      checkOutDate: parsed.checkOutDate,
      nights,
      nightIndex: i + 1,
      isFirstNight: i === 0,
      bookingRef: parsed.bookingRef ?? null,
      bookingPlatform: parsed.bookingPlatform ?? null,
      totalCost: i === 0 ? parsed.totalCost ?? null : null,
      ticketCurrency: parsed.ticketCurrency ?? null,
      breakfastIncluded: parsed.breakfastIncluded ?? null,
      parkingAvailable: parsed.parkingAvailable ?? null,
      parkingFeePerNight: parsed.parkingFeePerNight ?? null,
      guestCount: parsed.guestCount ?? null,
      wifiPassword: parsed.wifiPassword ?? null,
      cancellationPolicy: parsed.cancellationPolicy ?? null,
    };
    const item = await prisma.scheduleItem.create({
      data: {
        dayId,
        placeId,
        kind: "LODGING",
        startTime: "00:00",
        endTime: "23:59",
        durationMin: 0,
        suggestedDurationMin: 0,
        orderIndex: Math.max(0, orderIndex),
        isAllDay: true,
        note: i === 0 ? parsed.notes ?? null : null,
        metadataJson: JSON.stringify(meta),
      },
    });
    if (i === 0) firstItemId = item.id;
  }
  for (const dId of new Set(dayIds)) await recalcDayTransports(dId).catch(() => {});
  return firstItemId ?? "";
}

// ─── MEAL ────────────────────────────────────────────────────────────────

export const addMealInput = z.object({
  tripId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  restaurant: z.object({
    googlePlace: z.unknown().nullable().optional(),
    name: z.string().min(1).max(120),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    rating: z.number().optional(),
    ratingCount: z.number().optional(),
    iconKey: z.string().optional(),
  }),
  mealPeriod: z.enum(["BREAKFAST", "LUNCH", "DINNER", "LATE_NIGHT"]).optional(),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMin: z.number().int().min(0).max(600).optional(),
  partySize: z.number().int().min(1).max(50).optional(),
  averagePrice: z.number().nonnegative().nullable().optional(),
  ticketCurrency: z.string().length(3).nullable().optional(),
  reservationRef: z.string().nullable().optional(),
  reservationPlatform: z.string().nullable().optional(),
  cuisine: z.string().nullable().optional(),
  mustTry: z.string().nullable().optional(),
  specialRequests: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AddMealInput = z.infer<typeof addMealInput>;

export async function addMeal(input: AddMealInput): Promise<string> {
  const parsed = addMealInput.parse(input);
  const dayId = await findOrCreateDayByDate(parsed.tripId, parsed.date);

  let placeId: string;
  if (parsed.restaurant.googlePlace) {
    const gp = parsed.restaurant.googlePlace as PlaceSearchResult;
    await upsertPlaceFromGoogle(gp);
    placeId = gp.googlePlaceId;
  } else {
    placeId = await upsertCustomPlace({
      name: parsed.restaurant.name,
      category: parsed.cuisine ?? "餐廳",
      iconKey: (parsed.restaurant.iconKey as PlaceIconKey) ?? "restaurant",
      address: parsed.restaurant.address,
      lat: parsed.restaurant.lat,
      lng: parsed.restaurant.lng,
      rating: parsed.restaurant.rating,
      ratingCount: parsed.restaurant.ratingCount,
    });
  }

  const start = parsed.reservationTime ?? defaultMealTime(parsed.mealPeriod);
  const dur = parsed.durationMin ?? 60;
  const startMin = parseHM(start);
  const meta = {
    mealPeriod: parsed.mealPeriod ?? null,
    reservationTime: parsed.reservationTime ?? null,
    reservationRef: parsed.reservationRef ?? null,
    reservationPlatform: parsed.reservationPlatform ?? null,
    averagePrice: parsed.averagePrice ?? null,
    partySize: parsed.partySize ?? null,
    ticketCurrency: parsed.ticketCurrency ?? null,
    cuisine: parsed.cuisine ?? null,
    mustTry: parsed.mustTry ?? null,
    specialRequests: parsed.specialRequests ?? null,
  };
  const orderIndex = await nextOrderIndex(dayId);
  const item = await prisma.scheduleItem.create({
    data: {
      dayId,
      placeId,
      kind: "MEAL",
      startTime: start,
      endTime: fmtHM(startMin + dur),
      durationMin: dur,
      suggestedDurationMin: dur,
      orderIndex,
      isAllDay: false,
      note: parsed.notes ?? null,
      metadataJson: JSON.stringify(meta),
    },
  });
  await recalcDayTransports(dayId);
  return item.id;
}

function defaultMealTime(period?: "BREAKFAST" | "LUNCH" | "DINNER" | "LATE_NIGHT"): string {
  switch (period) {
    case "BREAKFAST": return "08:00";
    case "LUNCH": return "12:30";
    case "DINNER": return "18:30";
    case "LATE_NIGHT": return "22:00";
    default: return "12:30";
  }
}

// ─── ATTRACTION ────────────────────────────────────────────────────────────

export const addAttractionInput = z.object({
  tripId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  place: z.object({
    googlePlace: z.unknown().nullable().optional(),
    name: z.string().min(1).max(120),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    rating: z.number().optional(),
    ratingCount: z.number().optional(),
    iconKey: z.string().optional(),
  }),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMin: z.number().int().min(0).max(720).optional(),
  reservationRequired: z.boolean().optional(),
  bookingRef: z.string().nullable().optional(),
  tickets: z
    .array(
      z.object({
        label: z.string(),
        unitPrice: z.number().nonnegative(),
        quantity: z.number().int().min(0).default(1),
      }),
    )
    .nullable()
    .optional(),
  ticketCurrency: z.string().length(3).nullable().optional(),
  openingHours: z.string().nullable().optional(),
  highlights: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AddAttractionInput = z.infer<typeof addAttractionInput>;

export async function addAttraction(input: AddAttractionInput): Promise<string> {
  const parsed = addAttractionInput.parse(input);
  const dayId = await findOrCreateDayByDate(parsed.tripId, parsed.date);

  let placeId: string;
  if (parsed.place.googlePlace) {
    const gp = parsed.place.googlePlace as PlaceSearchResult;
    await upsertPlaceFromGoogle(gp);
    placeId = gp.googlePlaceId;
  } else {
    placeId = await upsertCustomPlace({
      name: parsed.place.name,
      category: "景點",
      iconKey: (parsed.place.iconKey as PlaceIconKey) ?? "landmark",
      address: parsed.place.address,
      lat: parsed.place.lat,
      lng: parsed.place.lng,
      rating: parsed.place.rating,
      ratingCount: parsed.place.ratingCount,
    });
  }

  const dur = parsed.durationMin ?? 90;
  const startTime = parsed.startTime ?? "09:00";
  const meta = {
    expectedDurationMin: dur,
    reservationRequired: parsed.reservationRequired ?? null,
    bookingRef: parsed.bookingRef ?? null,
    tickets: parsed.tickets && parsed.tickets.length > 0 ? parsed.tickets : null,
    ticketCurrency: parsed.ticketCurrency ?? null,
    openingHours: parsed.openingHours ?? null,
    highlights: parsed.highlights ?? null,
  };
  const orderIndex = await nextOrderIndex(dayId);
  const item = await prisma.scheduleItem.create({
    data: {
      dayId,
      placeId,
      kind: "ATTRACTION",
      startTime,
      endTime: fmtHM(parseHM(startTime) + dur),
      durationMin: dur,
      suggestedDurationMin: dur,
      orderIndex,
      isAllDay: false,
      note: parsed.notes ?? null,
      metadataJson: JSON.stringify(meta),
    },
  });
  await recalcDayTransports(dayId);
  return item.id;
}

// ─── CAR_RENTAL ────────────────────────────────────────────────────────────

export const addCarRentalInput = z.object({
  tripId: z.string(),
  pickupPlace: z.object({
    googlePlace: z.unknown().nullable().optional(),
    name: z.string().min(1).max(120),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  returnPlace: z.object({
    googlePlace: z.unknown().nullable().optional(),
    name: z.string().min(1).max(120),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  sameLocation: z.boolean().optional(),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnTime: z.string().regex(/^\d{2}:\d{2}$/),
  vendor: z.string().nullable().optional(),
  carModel: z.string().nullable().optional(),
  bookingRef: z.string().nullable().optional(),
  dailyRate: z.number().nonnegative().nullable().optional(),
  ticketCurrency: z.string().length(3).nullable().optional(),
  insuranceTier: z.enum(["BASIC", "PREMIUM", "FULL", "NONE"]).nullable().optional(),
  insurancePerDay: z.number().nonnegative().nullable().optional(),
  fuelPolicy: z.enum(["FULL_TO_FULL", "FULL_TO_EMPTY", "PRE_PURCHASED", "OTHER"]).nullable().optional(),
  addOns: z.string().nullable().optional(),
  addOnTotal: z.number().nonnegative().nullable().optional(),
  driverLicense: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AddCarRentalInput = z.infer<typeof addCarRentalInput>;

export async function addCarRental(input: AddCarRentalInput): Promise<string> {
  const parsed = addCarRentalInput.parse(input);
  const start = new Date(parsed.pickupDate + "T00:00:00Z");
  const end = new Date(parsed.returnDate + "T00:00:00Z");
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const groupId = `car-${Date.now().toString(36)}`;

  // Pickup place
  let pickupPlaceId: string;
  if (parsed.pickupPlace.googlePlace) {
    const gp = parsed.pickupPlace.googlePlace as PlaceSearchResult;
    await upsertPlaceFromGoogle(gp);
    pickupPlaceId = gp.googlePlaceId;
  } else {
    pickupPlaceId = await upsertCustomPlace({
      name: parsed.pickupPlace.name,
      category: "租車",
      iconKey: "car-rental" as PlaceIconKey,
      address: parsed.pickupPlace.address,
      lat: parsed.pickupPlace.lat,
      lng: parsed.pickupPlace.lng,
    });
  }
  // Return place
  let returnPlaceId: string;
  if (parsed.sameLocation) {
    returnPlaceId = pickupPlaceId;
  } else if (parsed.returnPlace.googlePlace) {
    const gp = parsed.returnPlace.googlePlace as PlaceSearchResult;
    await upsertPlaceFromGoogle(gp);
    returnPlaceId = gp.googlePlaceId;
  } else {
    returnPlaceId = await upsertCustomPlace({
      name: parsed.returnPlace.name,
      category: "租車",
      iconKey: "car-rental" as PlaceIconKey,
      address: parsed.returnPlace.address,
      lat: parsed.returnPlace.lat,
      lng: parsed.returnPlace.lng,
    });
  }

  const total =
    (parsed.dailyRate ?? 0) * days +
    (parsed.insurancePerDay ?? 0) * days +
    (parsed.addOnTotal ?? 0);

  const baseMeta = {
    rentalGroupId: groupId,
    vendor: parsed.vendor ?? null,
    carModel: parsed.carModel ?? null,
    bookingRef: parsed.bookingRef ?? null,
    dailyRate: parsed.dailyRate ?? null,
    rentalDays: days,
    ticketCurrency: parsed.ticketCurrency ?? null,
    insuranceTier: parsed.insuranceTier ?? null,
    insurancePerDay: parsed.insurancePerDay ?? null,
    fuelPolicy: parsed.fuelPolicy ?? null,
    addOns: parsed.addOns ?? null,
    addOnTotal: parsed.addOnTotal ?? null,
    driverLicense: parsed.driverLicense ?? null,
    pickupLocation: parsed.pickupPlace.name,
    returnLocation: parsed.returnPlace.name,
    pickupDate: parsed.pickupDate,
    pickupTime: parsed.pickupTime,
    returnDate: parsed.returnDate,
    returnTime: parsed.returnTime,
  };

  const pickupDayId = await findOrCreateDayByDate(parsed.tripId, parsed.pickupDate);
  const pickupOrderIndex = await nextOrderIndex(pickupDayId);
  const pickupItem = await prisma.scheduleItem.create({
    data: {
      dayId: pickupDayId,
      placeId: pickupPlaceId,
      kind: "CAR_RENTAL",
      startTime: parsed.pickupTime,
      endTime: fmtHM(parseHM(parsed.pickupTime) + 30),
      durationMin: 30,
      suggestedDurationMin: 30,
      orderIndex: pickupOrderIndex,
      isAllDay: false,
      isTimeLocked: true,
      note: parsed.notes ?? null,
      metadataJson: JSON.stringify({ ...baseMeta, segmentRole: "PICKUP", totalCost: total > 0 ? total : null }),
    },
  });
  const returnDayId = await findOrCreateDayByDate(parsed.tripId, parsed.returnDate);
  const returnOrderIndex = await nextOrderIndex(returnDayId);
  await prisma.scheduleItem.create({
    data: {
      dayId: returnDayId,
      placeId: returnPlaceId,
      kind: "CAR_RENTAL",
      startTime: parsed.returnTime,
      endTime: fmtHM(parseHM(parsed.returnTime) + 20),
      durationMin: 20,
      suggestedDurationMin: 20,
      orderIndex: returnOrderIndex,
      isAllDay: false,
      isTimeLocked: true,
      metadataJson: JSON.stringify({ ...baseMeta, segmentRole: "RETURN", totalCost: null }),
    },
  });
  await recalcDayTransports(pickupDayId);
  if (returnDayId !== pickupDayId) await recalcDayTransports(returnDayId);
  return pickupItem.id;
}

// ─── FREE / TRANSPORT_STOP ────────────────────────────────────────────────────

export const addFreeInput = z.object({
  tripId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1).max(120),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMin: z.number().int().min(0).max(1440).optional(),
  place: z
    .object({
      googlePlace: z.unknown().nullable().optional(),
      name: z.string(),
      address: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .nullable()
    .optional(),
  budget: z.number().nonnegative().nullable().optional(),
  ticketCurrency: z.string().length(3).nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AddFreeInput = z.infer<typeof addFreeInput>;

export async function addFree(input: AddFreeInput): Promise<string> {
  return addSimpleItem(input, "FREE", "free");
}

export const addStopInput = addFreeInput.extend({
  purpose: z.string().nullable().optional(),
});
export type AddStopInput = z.infer<typeof addStopInput>;

export async function addStop(input: AddStopInput): Promise<string> {
  return addSimpleItem(input, "TRANSPORT_STOP", "transport-stop");
}

async function addSimpleItem(
  input: AddFreeInput & { purpose?: string | null },
  kind: "FREE" | "TRANSPORT_STOP",
  iconKey: string,
): Promise<string> {
  const dayId = await findOrCreateDayByDate(input.tripId, input.date);
  let placeId: string | null = null;
  if (input.place) {
    if (input.place.googlePlace) {
      const gp = input.place.googlePlace as PlaceSearchResult;
      await upsertPlaceFromGoogle(gp);
      placeId = gp.googlePlaceId;
    } else if (input.place.name) {
      placeId = await upsertCustomPlace({
        name: input.place.name,
        category: kind === "FREE" ? "自由活動" : "中繼",
        iconKey: iconKey as PlaceIconKey,
        address: input.place.address,
        lat: input.place.lat,
        lng: input.place.lng,
      });
    }
  }
  const start = input.startTime ?? "10:00";
  const dur = input.durationMin ?? (kind === "FREE" ? 120 : 30);
  const meta: Record<string, unknown> = {
    plan: input.title,
    budget: input.budget ?? null,
    ticketCurrency: input.ticketCurrency ?? null,
  };
  if (kind === "TRANSPORT_STOP" && input.purpose) meta.purpose = input.purpose;
  const orderIndex = await nextOrderIndex(dayId);
  const item = await prisma.scheduleItem.create({
    data: {
      dayId,
      placeId,
      kind,
      startTime: start,
      endTime: fmtHM(parseHM(start) + dur),
      durationMin: dur,
      suggestedDurationMin: dur,
      orderIndex,
      isAllDay: false,
      note: input.notes ?? null,
      metadataJson: JSON.stringify(meta),
    },
  });
  await recalcDayTransports(dayId);
  return item.id;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
