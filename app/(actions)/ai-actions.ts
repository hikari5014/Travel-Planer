"use server";

import { revalidatePath } from "next/cache";
import { suggestPreTripNotes, suggestPackingChecklist } from "@/lib/services/ai-service";

export async function generatePreTripNotesAction(tripId: string, planId: string) {
  await suggestPreTripNotes(planId);
  revalidatePath(`/trips/${tripId}/ai`);
}

export async function generatePackingChecklistAction(tripId: string, planId: string) {
  await suggestPackingChecklist(planId);
  revalidatePath(`/trips/${tripId}/ai`);
}
