"use server";

import { revalidatePath } from "next/cache";
import {
  appendDayToTrip,
  createBlankPlan,
  duplicatePlan,
  deletePlan,
  setDefaultPlan,
} from "@/lib/services/plan-service";

export async function duplicatePlanAction(tripId: string, sourcePlanId: string) {
  await duplicatePlan(sourcePlanId);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/compare`);
  revalidatePath(`/trips/${tripId}/expenses`);
}

export async function deletePlanAction(tripId: string, planId: string) {
  await deletePlan(planId);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/compare`);
}

export async function setDefaultPlanAction(tripId: string, planId: string) {
  await setDefaultPlan(tripId, planId);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/");
}

// Day strip "+" button → append a fresh blank Day to every plan in the trip.
// All plans share the calendar so adding to all keeps them aligned.
export async function appendDayAction(tripId: string) {
  const result = await appendDayToTrip(tripId);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/compare`);
  return result;
}

// Header "+" tab → create a fresh empty plan with the same day shape.
export async function createBlankPlanAction(tripId: string, name?: string) {
  const planId = await createBlankPlan(tripId, name);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/compare`);
  return planId;
}
