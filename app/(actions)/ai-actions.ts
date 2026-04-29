"use server";

import { revalidatePath } from "next/cache";
import {
  suggestPreTripNotes,
  suggestPackingChecklist,
  suggestTransport,
  type TransportSuggestion,
} from "@/lib/services/ai-service";
import { applyAITransportSuggestion } from "@/lib/services/transport-service";

export async function generatePreTripNotesAction(tripId: string, planId: string) {
  await suggestPreTripNotes(planId);
  revalidatePath(`/trips/${tripId}/ai`);
}

export async function generatePackingChecklistAction(tripId: string, planId: string) {
  await suggestPackingChecklist(planId);
  revalidatePath(`/trips/${tripId}/ai`);
}

// AI route fill — generates a TransportSuggestion AND persists it onto the
// Transport row (manuallyEdited=true, aiGeneratedAt=now). Returns the
// suggestion so the dialog can pre-populate fields without a second request.
export async function aiSuggestTransportAction(input: {
  tripId: string;
  transportId: string;
  fromName: string;
  toName: string;
  modeHint?: "DRIVING" | "TRANSIT" | "WALKING" | "CUSTOM";
  region?: string;
}): Promise<TransportSuggestion> {
  const result = await suggestTransport({
    fromName: input.fromName,
    toName: input.toName,
    ...(input.modeHint ? { modeHint: input.modeHint } : {}),
    ...(input.region ? { region: input.region } : {}),
  });
  await applyAITransportSuggestion(input.transportId, {
    mode: result.mode,
    distanceMeters: result.distanceMeters,
    durationSec: result.durationSec,
    estimatedCost: result.estimatedCost ?? null,
    transitLine: result.transitLine ?? null,
    notes: result.notes ?? null,
  });
  revalidatePath(`/trips/${input.tripId}`);
  return result;
}
