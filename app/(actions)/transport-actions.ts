"use server";

import { revalidatePath } from "next/cache";
import {
  resetTransportToAuto,
  updateTransport,
  type TransportUpdateInput,
} from "@/lib/services/transport-service";
import {
  placesParkingNearby,
  upsertPlaceFromGoogle,
  type PlaceSearchResult,
} from "@/lib/services/place-service";
import {
  buildDepartureIso,
  fetchAllModes,
  fetchDirections,
  parseTransitSteps,
  persistDirectionsToTransport,
  type InternalMode,
  type ModesSummary,
  type ParsedTransitStep,
} from "@/lib/services/directions-service";
import { prisma } from "@/lib/db";

export async function updateTransportAction(
  tripId: string,
  transportId: string,
  input: TransportUpdateInput,
) {
  await updateTransport(transportId, input);
  revalidatePath(`/trips/${tripId}`);
}

export async function resetTransportAction(tripId: string, transportId: string) {
  await resetTransportToAuto(transportId);
  revalidatePath(`/trips/${tripId}`);
}

// Parking suggestion for a DRIVING segment. Resolves the Transport's "to"
// schedule item's place, queries Google Places for nearby parking lots
// within `radiusM`, and returns the candidates. The user picks one in the
// UI; setTransportParking persists the choice.
export async function suggestParkingAction(
  transportId: string,
  radiusM: number = 500,
): Promise<{ ok: true; results: PlaceSearchResult[] } | { ok: false; error: string }> {
  try {
    const transport = await prisma.transport.findUnique({
      where: { id: transportId },
      include: { toItem: { include: { place: true } } },
    });
    if (!transport?.toItem?.place) return { ok: false, error: "找不到目的景點的座標" };
    const p = transport.toItem.place;
    if (p.lat == null || p.lng == null) {
      return { ok: false, error: "目的景點沒有 lat/lng — 請先選一個 Google 收錄的景點" };
    }
    const results = await placesParkingNearby(p.lat, p.lng, radiusM);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setTransportParkingAction(
  tripId: string,
  transportId: string,
  parking: PlaceSearchResult,
) {
  await upsertPlaceFromGoogle(parking);
  await prisma.transport.update({
    where: { id: transportId },
    data: { parkingPlaceId: parking.googlePlaceId },
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function clearTransportParkingAction(tripId: string, transportId: string) {
  await prisma.transport.update({
    where: { id: transportId },
    data: { parkingPlaceId: null },
  });
  revalidatePath(`/trips/${tripId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — Google Routes API integration
// ─────────────────────────────────────────────────────────────────────────────

// Refresh ONE Transport's chosen-mode directions. Re-queries Google with
// the from→to lat/lng + the from-item's endTime as departure_time. Persists
// the encoded polyline + raw response + auto-filled fare/cost.
export async function refreshTransportDirectionsAction(
  tripId: string,
  transportId: string,
  modeOverride?: InternalMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const t = await prisma.transport.findUnique({
      where: { id: transportId },
      include: {
        fromItem: { include: { place: true, day: true } },
        toItem: { include: { place: true } },
      },
    });
    if (!t?.fromItem?.place || !t.toItem?.place) {
      return { ok: false, error: "起訖點缺座標 — 此段移動無法查詢路線" };
    }
    const fp = t.fromItem.place;
    const tp = t.toItem.place;
    if (fp.lat == null || fp.lng == null || tp.lat == null || tp.lng == null) {
      return { ok: false, error: "起訖點 lat/lng 缺失（請從 Google Places 重新加入景點）" };
    }
    const mode = (modeOverride ?? t.mode) as InternalMode;
    if (mode === "CUSTOM") {
      return { ok: false, error: "CUSTOM 模式不會查 Google 路線" };
    }
    if ((mode as string) === "FLIGHT") {
      return { ok: false, error: "FLIGHT 模式不查 Google Routes（手動填航班資訊）" };
    }
    const dayDate = t.fromItem.day.date.toISOString().slice(0, 10);
    const dep = buildDepartureIso(dayDate, t.fromItem.endTime, fp.lng);
    const result = await fetchDirections({
      fromLat: fp.lat,
      fromLng: fp.lng,
      toLat: tp.lat,
      toLng: tp.lng,
      mode: mode as "DRIVING" | "WALKING" | "TRANSIT" | "BICYCLING",
      ...(dep ? { departureAtIso: dep } : {}),
      fieldMask: "full",
    });
    await persistDirectionsToTransport(transportId, result);
    await prisma.transport.update({
      where: { id: transportId },
      data: { departureAtIso: dep ?? null },
    });
    revalidatePath(`/trips/${tripId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Fetch all 4 modes for a Transport segment so the dialog can show a
// side-by-side compare table. Doesn't mutate the Transport (just returns
// the summaries).
export async function compareTransportModesAction(
  transportId: string,
): Promise<{ ok: true; modes: ModesSummary } | { ok: false; error: string }> {
  try {
    const t = await prisma.transport.findUnique({
      where: { id: transportId },
      include: {
        fromItem: { include: { place: true, day: true } },
        toItem: { include: { place: true } },
      },
    });
    if (!t?.fromItem?.place || !t.toItem?.place) {
      return { ok: false, error: "起訖點缺座標" };
    }
    const fp = t.fromItem.place;
    const tp = t.toItem.place;
    if (fp.lat == null || fp.lng == null || tp.lat == null || tp.lng == null) {
      return { ok: false, error: "起訖點 lat/lng 缺失" };
    }
    const dayDate = t.fromItem.day.date.toISOString().slice(0, 10);
    const dep = buildDepartureIso(dayDate, t.fromItem.endTime, fp.lng);
    const modes = await fetchAllModes({
      fromLat: fp.lat,
      fromLng: fp.lng,
      toLat: tp.lat,
      toLng: tp.lng,
      ...(dep ? { departureAtIso: dep } : {}),
    });
    // Cache the summary so the next dialog open shows it instantly.
    await prisma.transport.update({
      where: { id: transportId },
      data: { modesSummaryJson: JSON.stringify(modes) },
    });
    return { ok: true, modes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Apply ONE of the compare-result modes as the chosen mode + persist its
// directions cache. Used by the dialog after the user clicks a mode column.
export async function applyTransportModeAction(
  tripId: string,
  transportId: string,
  mode: Exclude<InternalMode, "CUSTOM">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return refreshTransportDirectionsAction(tripId, transportId, mode);
}

// Phase 9.5 — fetch the slim, parsed step-by-step transit list for one
// Transport. Lazy-loaded by TransportEditDialog when its TRANSIT detail
// panel opens (avoids dragging the whole cache JSON through MockTransport
// for every segment all the time).
export async function getTransitStepsAction(
  transportId: string,
): Promise<{ ok: true; steps: ParsedTransitStep[] } | { ok: false; error: string }> {
  try {
    const t = await prisma.transport.findUnique({
      where: { id: transportId },
      select: { directionsCacheJson: true },
    });
    if (!t?.directionsCacheJson) {
      return { ok: false, error: "尚未查詢過路線 — 請先按「刷新」抓 Google Routes 結果" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(t.directionsCacheJson);
    } catch {
      return { ok: false, error: "Routes cache JSON 解析失敗" };
    }
    const steps = parseTransitSteps(parsed);
    return { ok: true, steps };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
