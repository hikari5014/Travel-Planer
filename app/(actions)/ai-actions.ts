"use server";

import { revalidatePath } from "next/cache";
import {
  pingDefaultProvider,
  suggestPreTripNotes,
  suggestPackingChecklist,
  suggestStayMinutes as suggestStayMinutesAI,
  suggestTransport,
  type StaySuggestion,
  type TransportSuggestion,
} from "@/lib/services/ai-service";
import { applyAITransportSuggestion } from "@/lib/services/transport-service";
import { prisma } from "@/lib/db";

// "Test connection" button on /settings. Sends a minimal ping prompt to the
// default provider so the user can verify their key + model + base URL all
// work before relying on them for real generations.
export async function pingDefaultProviderAction() {
  return pingDefaultProvider();
}

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
// AI re-estimate of a Place.defaultStayMinutes. Persists with
// defaultStaySource = "AI" for provenance. Used by FloatingPlaceCard.
export async function aiReestimateStayAction(input: {
  tripId: string;
  googlePlaceId: string;
  region?: string;
}): Promise<{ ok: true; result: StaySuggestion } | { ok: false; error: string }> {
  try {
    const place = await prisma.place.findUnique({
      where: { googlePlaceId: input.googlePlaceId },
    });
    if (!place) return { ok: false, error: "找不到景點" };
    const result = await suggestStayMinutesAI({
      name: place.name,
      category: place.category,
      ...(place.address ? { address: place.address } : {}),
      ...(input.region ? { region: input.region } : {}),
    });
    await prisma.place.update({
      where: { googlePlaceId: input.googlePlaceId },
      data: {
        defaultStayMinutes: result.minutes,
        defaultStaySource: "AI",
        fetchedAt: new Date(),
      },
    });
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

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
