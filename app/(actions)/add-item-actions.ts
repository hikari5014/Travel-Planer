"use server";

import { revalidatePath } from "next/cache";
import {
  addAttraction,
  addCarRental,
  addFlight,
  addFree,
  addLodging,
  addMeal,
  addStop,
  type AddAttractionInput,
  type AddCarRentalInput,
  type AddFlightInput,
  type AddFreeInput,
  type AddLodgingInput,
  type AddMealInput,
  type AddStopInput,
} from "@/lib/services/add-item-service";

type Result = { ok: true; itemId: string } | { ok: false; error: string };

function err(e: unknown): Result {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export async function addFlightAction(input: AddFlightInput): Promise<Result> {
  try {
    const itemId = await addFlight(input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true, itemId };
  } catch (e) {
    return err(e);
  }
}

export async function addLodgingAction(input: AddLodgingInput): Promise<Result> {
  try {
    const itemId = await addLodging(input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true, itemId };
  } catch (e) {
    return err(e);
  }
}

export async function addMealAction(input: AddMealInput): Promise<Result> {
  try {
    const itemId = await addMeal(input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true, itemId };
  } catch (e) {
    return err(e);
  }
}

export async function addAttractionAction(input: AddAttractionInput): Promise<Result> {
  try {
    const itemId = await addAttraction(input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true, itemId };
  } catch (e) {
    return err(e);
  }
}

export async function addCarRentalAction(input: AddCarRentalInput): Promise<Result> {
  try {
    const itemId = await addCarRental(input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true, itemId };
  } catch (e) {
    return err(e);
  }
}

export async function addFreeAction(input: AddFreeInput): Promise<Result> {
  try {
    const itemId = await addFree(input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true, itemId };
  } catch (e) {
    return err(e);
  }
}

export async function addStopAction(input: AddStopInput): Promise<Result> {
  try {
    const itemId = await addStop(input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true, itemId };
  } catch (e) {
    return err(e);
  }
}

// Phase 14j — edit-mode counterparts of the add actions. Take itemId +
// the same input shape; do not move the item to a different day.

import {
  updateAttraction,
  updateCarRental,
  updateFlight,
  updateFree,
  updateLodging,
  updateMeal,
  updateStop,
} from "@/lib/services/edit-item-service";

type UpdateResult = { ok: true } | { ok: false; error: string };
function uerr(e: unknown): UpdateResult {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export async function updateFlightAction(itemId: string, input: AddFlightInput): Promise<UpdateResult> {
  try {
    await updateFlight(itemId, input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) { return uerr(e); }
}
export async function updateLodgingAction(itemId: string, input: AddLodgingInput): Promise<UpdateResult> {
  try {
    await updateLodging(itemId, input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) { return uerr(e); }
}
export async function updateMealAction(itemId: string, input: AddMealInput): Promise<UpdateResult> {
  try {
    await updateMeal(itemId, input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) { return uerr(e); }
}
export async function updateAttractionAction(itemId: string, input: AddAttractionInput): Promise<UpdateResult> {
  try {
    await updateAttraction(itemId, input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) { return uerr(e); }
}
export async function updateCarRentalAction(itemId: string, input: AddCarRentalInput): Promise<UpdateResult> {
  try {
    await updateCarRental(itemId, input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) { return uerr(e); }
}
export async function updateFreeAction(itemId: string, input: AddFreeInput): Promise<UpdateResult> {
  try {
    await updateFree(itemId, input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) { return uerr(e); }
}
export async function updateStopAction(itemId: string, input: AddStopInput): Promise<UpdateResult> {
  try {
    await updateStop(itemId, input);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) { return uerr(e); }
}

// Phase 14k — given any night-row id of a multi-night LODGING booking, return
// the first-night row's id + metadata + check-in date so the edit dialog can
// always open with the canonical booking values regardless of which night
// the user clicked.
import { prisma as _prismaForLodging } from "@/lib/db";

export async function getLodgingBookingForEditAction(itemId: string): Promise<
  | { ok: true; firstNightItemId: string; checkInDate: string; metadata: Record<string, unknown>; note: string | null }
  | { ok: false; error: string }
> {
  try {
    const row = await _prismaForLodging.scheduleItem.findUnique({ where: { id: itemId } });
    if (!row || row.kind !== "LODGING") return { ok: false, error: "找不到住宿項目" };
    const meta = row.metadataJson ? (JSON.parse(row.metadataJson) as Record<string, unknown>) : {};
    const checkOutDate = (meta.checkOutDate as string | undefined) ?? null;
    if (!checkOutDate) {
      // Single-night fallback — treat the row itself as first night
      const day = await _prismaForLodging.day.findUnique({ where: { id: row.dayId } });
      return {
        ok: true,
        firstNightItemId: row.id,
        checkInDate: day ? day.date.toISOString().slice(0, 10) : "",
        metadata: meta,
        note: row.note,
      };
    }
    const planRow = await _prismaForLodging.day.findUnique({
      where: { id: row.dayId },
      select: { plan: { select: { tripId: true } } },
    });
    const tripId = planRow?.plan.tripId;
    if (!tripId) return { ok: false, error: "找不到所屬 trip" };
    const siblings = await _prismaForLodging.scheduleItem.findMany({
      where: {
        kind: "LODGING",
        placeId: row.placeId,
        day: { plan: { tripId } },
      },
      include: { day: { select: { date: true } } },
    });
    const sameBooking = siblings.filter((r) => {
      if (!r.metadataJson) return false;
      try {
        return (JSON.parse(r.metadataJson) as Record<string, unknown>).checkOutDate === checkOutDate;
      } catch { return false; }
    });
    sameBooking.sort((a, b) => a.day.date.getTime() - b.day.date.getTime());
    const first = sameBooking[0] ?? row;
    const firstMeta = first.metadataJson ? (JSON.parse(first.metadataJson) as Record<string, unknown>) : {};
    const firstDay = await _prismaForLodging.day.findUnique({ where: { id: first.dayId } });
    return {
      ok: true,
      firstNightItemId: first.id,
      checkInDate: firstDay ? firstDay.date.toISOString().slice(0, 10) : "",
      metadata: firstMeta,
      note: first.note,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
