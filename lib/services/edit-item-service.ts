import "server-only";
import { prisma } from "@/lib/db";
import { recalcDayTransports } from "./transport-service";
import { safeRecalcPlanFromScheduleItemId } from "./expense-service";
import { addLodging } from "./add-item-service";
import type {
  AddAttractionInput,
  AddCarRentalInput,
  AddFlightInput,
  AddFreeInput,
  AddLodgingInput,
  AddMealInput,
  AddStopInput,
} from "./add-item-service";

// Phase 14j — edit-mode counterparts of add-item-service.
//
// Each updateXxx(itemId, input) updates the ScheduleItem the user is editing
// (and any siblings tied to it — FLIGHT arr item + transport, CAR_RENTAL
// pickup/return pair) without touching day/date. If the user wants to move
// to a different day they can delete + re-add (avoid re-implementing the
// findOrCreateDay flow under a different invariant).
//
// Place rows are NOT swapped on edit (place name is editable separately
// from the FloatingPlaceCard hero). Only metadata + note + start/end times.

function parseHM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}
function fmtHM(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

async function updateMeta(
  itemId: string,
  meta: Record<string, unknown>,
  note: string | null | undefined,
  times: { startTime?: string; endTime?: string; durationMin?: number; isAllDay?: boolean } = {},
): Promise<void> {
  const data: Record<string, unknown> = { metadataJson: JSON.stringify(meta) };
  if (note !== undefined) data.note = note;
  if (times.startTime !== undefined) data.startTime = times.startTime;
  if (times.endTime !== undefined) data.endTime = times.endTime;
  if (times.durationMin !== undefined) data.durationMin = times.durationMin;
  if (times.isAllDay !== undefined) data.isAllDay = times.isAllDay;
  await prisma.scheduleItem.update({ where: { id: itemId }, data });
}

async function recalcAfter(itemId: string): Promise<void> {
  const it = await prisma.scheduleItem.findUnique({ where: { id: itemId }, select: { dayId: true } });
  if (it) await recalcDayTransports(it.dayId).catch(() => {});
  await safeRecalcPlanFromScheduleItemId(itemId);
}

// ─── FLIGHT ────────────────────────────────────────────────────────────────

export async function updateFlight(itemId: string, input: AddFlightInput): Promise<void> {
  // Reuse arrAirportPlaceId from existing meta to keep the link to the arr item
  const existing = await prisma.scheduleItem.findUnique({ where: { id: itemId } });
  if (!existing || existing.kind !== "FLIGHT") throw new Error("找不到 FLIGHT 項目");
  const existingMeta = existing.metadataJson ? (JSON.parse(existing.metadataJson) as Record<string, unknown>) : {};
  const arrAirportPlaceId = (existingMeta.arrAirportPlaceId as string | undefined) ?? null;

  const offset = input.arrDateOffset ?? 0;
  const newDepMeta = {
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
    arrAirportPlaceId,
  };
  await updateMeta(itemId, newDepMeta, input.notes ?? null, {
    startTime: input.depTime,
    endTime: input.depTime,
    durationMin: 0,
  });

  // Sync the matching arrival item if we can find it (same day, same flight number,
  // placeId === arrAirportPlaceId). Created via createFlightSegmentAtDay.
  if (arrAirportPlaceId) {
    const arrItem = await prisma.scheduleItem.findFirst({
      where: {
        dayId: existing.dayId,
        kind: "FLIGHT",
        placeId: arrAirportPlaceId,
        id: { not: itemId },
      },
    });
    if (arrItem) {
      const arrMeta = arrItem.metadataJson ? (JSON.parse(arrItem.metadataJson) as Record<string, unknown>) : {};
      const newArrMeta = {
        ...arrMeta,
        flightNumber: input.flightNumber,
        airline: input.airline ?? null,
        depAirport: input.depAirport.toUpperCase(),
        arrAirport: input.arrAirport.toUpperCase(),
        depTime: input.depTime,
        arrTime: input.arrTime,
        arrTerminal: input.arrTerminal ?? null,
      };
      await prisma.scheduleItem.update({
        where: { id: arrItem.id },
        data: {
          startTime: input.arrTime,
          endTime: input.arrTime,
          metadataJson: JSON.stringify(newArrMeta),
        },
      });
      // Update FLIGHT-mode transport between dep → arr
      const dur = Math.max(0, parseHM(input.arrTime) + offset * 24 * 60 - parseHM(input.depTime));
      await prisma.transport.updateMany({
        where: {
          fromScheduleItemId: itemId,
          toScheduleItemId: arrItem.id,
        },
        data: {
          durationSec: dur * 60,
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
    }
  }

  await recalcAfter(itemId);
}

// ─── LODGING ────────────────────────────────────────────────────────────────

export async function updateLodging(itemId: string, input: AddLodgingInput): Promise<void> {
  // Locate ALL night rows of this booking. A booking is keyed by
  // placeId + checkOutDate (within a trip). We use that to find siblings
  // even when the user clicked a non-first night row.
  const existing = await prisma.scheduleItem.findUnique({
    where: { id: itemId },
    include: { day: { select: { date: true, planId: true, plan: { select: { tripId: true } } } } },
  });
  if (!existing || existing.kind !== "LODGING") throw new Error("找不到 LODGING 項目");
  const existingMeta = existing.metadataJson
    ? (JSON.parse(existing.metadataJson) as Record<string, unknown>)
    : {};
  const oldCheckOut = (existingMeta.checkOutDate as string | undefined) ?? null;
  const tripId = existing.day.plan.tripId;

  // All sibling rows (same trip + same placeId + same checkOutDate in meta)
  const sameTripLodging = await prisma.scheduleItem.findMany({
    where: {
      kind: "LODGING",
      placeId: existing.placeId,
      day: { plan: { tripId } },
    },
    include: { day: { select: { date: true } } },
  });
  const siblings = sameTripLodging.filter((row) => {
    if (!row.metadataJson) return false;
    try {
      const m = JSON.parse(row.metadataJson) as Record<string, unknown>;
      return (m.checkOutDate as string | undefined) === oldCheckOut;
    } catch {
      return false;
    }
  });
  // Sort by day.date ascending — first night is index 0
  siblings.sort((a, b) => a.day.date.getTime() - b.day.date.getTime());
  const firstNight = siblings[0] ?? existing;
  const firstNightDateIso = (firstNight as typeof existing).day.date.toISOString().slice(0, 10);

  // If date range changed → delete all night rows + recreate via addLodging
  // (drops the user into the same booking shape addLodging produces).
  const dateRangeChanged =
    input.checkInDate !== firstNightDateIso || input.checkOutDate !== oldCheckOut;
  if (dateRangeChanged) {
    const dayIds = new Set(siblings.map((s) => s.dayId));
    await prisma.scheduleItem.deleteMany({
      where: { id: { in: siblings.map((s) => s.id) } },
    });
    await addLodging(input);
    for (const dId of dayIds) await recalcDayTransports(dId).catch(() => {});
    return;
  }

  // Same date range → update each night's metadata in place. Only the first
  // night carries totalCost (so expense isn't double-counted) + the user note.
  for (let i = 0; i < siblings.length; i++) {
    const row = siblings[i];
    const isFirst = i === 0;
    const rowMetaPrev = row.metadataJson
      ? (JSON.parse(row.metadataJson) as Record<string, unknown>)
      : {};
    const meta = {
      ...rowMetaPrev,
      checkInTime: input.checkInTime ?? "15:00",
      checkOutTime: input.checkOutTime ?? "11:00",
      checkOutDate: input.checkOutDate,
      nights: siblings.length,
      nightIndex: i + 1,
      isFirstNight: isFirst,
      bookingRef: input.bookingRef ?? null,
      bookingPlatform: input.bookingPlatform ?? null,
      totalCost: isFirst ? input.totalCost ?? null : null,
      ticketCurrency: input.ticketCurrency ?? null,
      breakfastIncluded: input.breakfastIncluded ?? null,
      parkingAvailable: input.parkingAvailable ?? null,
      parkingFeePerNight: input.parkingFeePerNight ?? null,
      guestCount: input.guestCount ?? null,
      wifiPassword: input.wifiPassword ?? null,
      cancellationPolicy: input.cancellationPolicy ?? null,
    };
    await prisma.scheduleItem.update({
      where: { id: row.id },
      data: {
        metadataJson: JSON.stringify(meta),
        note: isFirst ? input.notes ?? null : null,
        isAllDay: true,
      },
    });
  }
  await recalcAfter(firstNight.id);
}

// ─── MEAL ───────────────────────────────────────────────────────────────────

export async function updateMeal(itemId: string, input: AddMealInput): Promise<void> {
  const start = input.reservationTime ?? defaultMealTime(input.mealPeriod);
  const dur = input.durationMin ?? 60;
  const meta = {
    mealPeriod: input.mealPeriod ?? null,
    reservationTime: input.reservationTime ?? null,
    reservationRef: input.reservationRef ?? null,
    reservationPlatform: input.reservationPlatform ?? null,
    averagePrice: input.averagePrice ?? null,
    partySize: input.partySize ?? null,
    ticketCurrency: input.ticketCurrency ?? null,
    cuisine: input.cuisine ?? null,
    mustTry: input.mustTry ?? null,
    specialRequests: input.specialRequests ?? null,
  };
  await updateMeta(itemId, meta, input.notes ?? null, {
    startTime: start,
    endTime: fmtHM(parseHM(start) + dur),
    durationMin: dur,
  });
  await recalcAfter(itemId);
}

function defaultMealTime(p?: "BREAKFAST" | "LUNCH" | "DINNER" | "LATE_NIGHT"): string {
  switch (p) {
    case "BREAKFAST": return "08:00";
    case "LUNCH": return "12:00";
    case "DINNER": return "18:30";
    case "LATE_NIGHT": return "22:00";
    default: return "12:00";
  }
}

// ─── ATTRACTION ─────────────────────────────────────────────────────────────

export async function updateAttraction(itemId: string, input: AddAttractionInput): Promise<void> {
  const dur = input.durationMin ?? 90;
  const startTime = input.startTime ?? "09:00";
  const meta = {
    expectedDurationMin: dur,
    tickets: input.tickets && input.tickets.length > 0 ? input.tickets : null,
    ticketCurrency: input.ticketCurrency ?? null,
    reservationRequired: input.reservationRequired ?? null,
    bookingRef: input.bookingRef ?? null,
    openingHours: input.openingHours ?? null,
    highlights: input.highlights ?? null,
  };
  await updateMeta(itemId, meta, input.notes ?? null, {
    startTime,
    endTime: fmtHM(parseHM(startTime) + dur),
    durationMin: dur,
  });
  await recalcAfter(itemId);
}

// ─── CAR_RENTAL ─────────────────────────────────────────────────────────────

export async function updateCarRental(itemId: string, input: AddCarRentalInput): Promise<void> {
  const existing = await prisma.scheduleItem.findUnique({ where: { id: itemId } });
  if (!existing || existing.kind !== "CAR_RENTAL") throw new Error("找不到 CAR_RENTAL 項目");
  const existingMeta = existing.metadataJson ? (JSON.parse(existing.metadataJson) as Record<string, unknown>) : {};
  const segmentRole = (existingMeta.segmentRole as "PICKUP" | "RETURN" | undefined) ?? "PICKUP";
  const rentalGroupId = existingMeta.rentalGroupId as string | undefined;

  const start = new Date(input.pickupDate + "T00:00:00Z");
  const end = new Date(input.returnDate + "T00:00:00Z");
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const total =
    (input.dailyRate ?? 0) * days +
    (input.insurancePerDay ?? 0) * days +
    (input.addOnTotal ?? 0);

  const sharedMeta = {
    vendor: input.vendor ?? null,
    carModel: input.carModel ?? null,
    bookingRef: input.bookingRef ?? null,
    pickupDate: input.pickupDate,
    pickupTime: input.pickupTime,
    pickupLocation: input.pickupPlace.name,
    returnDate: input.returnDate,
    returnTime: input.returnTime,
    returnLocation: input.returnPlace.name,
    dailyRate: input.dailyRate ?? null,
    rentalDays: days,
    insuranceTier: input.insuranceTier ?? null,
    insurancePerDay: input.insurancePerDay ?? null,
    fuelPolicy: input.fuelPolicy ?? null,
    addOns: input.addOns ?? null,
    addOnTotal: input.addOnTotal ?? null,
    driverLicense: input.driverLicense ?? null,
    ticketCurrency: input.ticketCurrency ?? null,
    rentalGroupId: rentalGroupId ?? null,
  };

  const isPickup = segmentRole === "PICKUP";
  const time = isPickup ? input.pickupTime : input.returnTime;
  const dur = isPickup ? 30 : 20;
  await updateMeta(
    itemId,
    {
      ...sharedMeta,
      segmentRole,
      totalCost: isPickup && total > 0 ? total : null,
    },
    input.notes ?? null,
    {
      startTime: time,
      endTime: fmtHM(parseHM(time) + dur),
      durationMin: dur,
    },
  );

  // Sync sibling segment metadata (so vendor / car model / dates stay aligned)
  if (rentalGroupId) {
    const siblings = await prisma.scheduleItem.findMany({
      where: { kind: "CAR_RENTAL", id: { not: itemId } },
    });
    for (const sibling of siblings) {
      const sm = sibling.metadataJson ? (JSON.parse(sibling.metadataJson) as Record<string, unknown>) : {};
      if (sm.rentalGroupId !== rentalGroupId) continue;
      const sibIsPickup = (sm.segmentRole as string | undefined) === "PICKUP";
      const sibTime = sibIsPickup ? input.pickupTime : input.returnTime;
      const sibDur = sibIsPickup ? 30 : 20;
      await prisma.scheduleItem.update({
        where: { id: sibling.id },
        data: {
          metadataJson: JSON.stringify({
            ...sharedMeta,
            segmentRole: sibIsPickup ? "PICKUP" : "RETURN",
            totalCost: sibIsPickup && total > 0 ? total : null,
          }),
          startTime: sibTime,
          endTime: fmtHM(parseHM(sibTime) + sibDur),
          durationMin: sibDur,
        },
      });
    }
  }

  await recalcAfter(itemId);
}

// ─── FREE ───────────────────────────────────────────────────────────────────

export async function updateFree(itemId: string, input: AddFreeInput): Promise<void> {
  const dur = input.durationMin ?? 120;
  const startTime = input.startTime ?? "14:00";
  const meta = {
    plan: input.title ?? null,
    budget: input.budget ?? null,
    ticketCurrency: input.ticketCurrency ?? null,
    alternativePlan: null as string | null,
  };
  await updateMeta(itemId, meta, input.notes ?? null, {
    startTime,
    endTime: fmtHM(parseHM(startTime) + dur),
    durationMin: dur,
  });
  await recalcAfter(itemId);
}

// ─── TRANSPORT_STOP ─────────────────────────────────────────────────────────

export async function updateStop(itemId: string, input: AddStopInput): Promise<void> {
  const dur = input.durationMin ?? 30;
  const startTime = input.startTime ?? "12:00";
  const meta = {
    purpose: input.purpose ?? null,
  };
  await updateMeta(itemId, meta, input.notes ?? null, {
    startTime,
    endTime: fmtHM(parseHM(startTime) + dur),
    durationMin: dur,
  });
  await recalcAfter(itemId);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
