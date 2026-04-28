"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { duplicatePlan, deletePlan, setDefaultPlan } from "@/lib/services/plan-service";

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
