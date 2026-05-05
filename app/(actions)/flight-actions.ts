"use server";

import { revalidatePath } from "next/cache";
import {
  applyFlightSuggestion,
  applyFlightSuggestionToTransport,
  expandFlightSchedule,
  type FlightAIInfo,
} from "@/lib/services/flight-service";
import { lookupFlight, type FlightLookupInfo, type FlightLookupTool } from "@/lib/services/flight-lookup-service";

// Phase 10d — flight server actions used by the FloatingPlaceCard
// "AI 自動填寫航班資訊" button + the metadata save path.

export type FlightSuggestResult =
  | { ok: true; info: FlightAIInfo; source: FlightLookupInfo["source"] }
  | { ok: false; error: string };

export async function suggestFlightInfoAction(input: {
  flightNumber: string;
  date: string;
  allowAI?: boolean;
  preferredTool?: FlightLookupTool;
}): Promise<FlightSuggestResult> {
  try {
    const info = await lookupFlight(input);
    // Down-cast FlightLookupInfo → FlightAIInfo (same shape minus `source`)
    const { source, ...rest } = info;
    return { ok: true, info: rest, source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "查詢失敗" };
  }
}

export async function applyFlightSuggestionAction(input: {
  tripId: string;
  flightItemId: string;
  info: FlightAIInfo;
  date: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await applyFlightSuggestion(input.flightItemId, input.info, input.date);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "套用失敗" };
  }
}

// Phase 10i — apply AI flight info to a Transport row (flight-as-mode).
export async function applyFlightSuggestionToTransportAction(input: {
  tripId: string;
  transportId: string;
  info: FlightAIInfo;
  date: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await applyFlightSuggestionToTransport(input.transportId, input.info, input.date);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "套用失敗" };
  }
}

export async function expandFlightScheduleAction(input: {
  tripId: string;
  flightItemId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await expandFlightSchedule(input.flightItemId);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "展開失敗" };
  }
}
