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
