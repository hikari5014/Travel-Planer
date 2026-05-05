"use server";

import { revalidatePath } from "next/cache";
import {
  computeFuelEstimateFromTransport,
  estimateDrivingSegmentsForTransport,
  clearDrivingSegments,
} from "@/lib/services/driving-segments-service";
import type { DrivingFuelEstimate, DrivingSegments } from "@/lib/services/driving-segments-types";

export async function fuelEstimateAction(transportId: string): Promise<DrivingFuelEstimate | null> {
  return computeFuelEstimateFromTransport(transportId);
}

export type EstimateDrivingResult =
  | { ok: true; data: DrivingSegments }
  | { ok: false; error: string };

export async function estimateDrivingSegmentsAction(
  tripId: string,
  transportId: string,
): Promise<EstimateDrivingResult> {
  try {
    const data = await estimateDrivingSegmentsForTransport(transportId);
    revalidatePath(`/trips/${tripId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "估算失敗" };
  }
}

export async function clearDrivingSegmentsAction(
  tripId: string,
  transportId: string,
): Promise<void> {
  await clearDrivingSegments(transportId);
  revalidatePath(`/trips/${tripId}`);
}
