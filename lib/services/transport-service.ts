import "server-only";
import { prisma } from "@/lib/db";
import {
  buildDepartureIso,
  fetchDirections,
  persistDirectionsToTransport,
  type InternalMode,
} from "./directions-service";
import { getGoogleMapsKey } from "./settings-service";
import { safeRecalcPlanFromDayId, safeRecalcPlanFromTransportId } from "./expense-service";

// ─────────────────────────────────────────────────────────────────────────────
// Distance / duration estimation — offline fallback for Phase 1a.
// Phase 2+ will hit Google Directions API when a Server key is configured.
// ─────────────────────────────────────────────────────────────────────────────

const SPEED_MS: Record<string, number> = {
  // Effective average speed including stops (m/s)
  WALKING: 1.3,
  TRANSIT: 6.0,
  DRIVING: 9.0,
};

// Haversine for real lat/lng; if both points only have demo mapX/Y we estimate
// distance in arbitrary units → meters with a fixed scale (1 mapPx ≈ 50 m,
// chosen so the seeded Kyoto layout produces realistic-looking distances).
const MAP_PX_TO_METERS = 50;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function estimateDistance(
  from: { lat: number | null; lng: number | null; mapX: number | null; mapY: number | null },
  to:   { lat: number | null; lng: number | null; mapX: number | null; mapY: number | null },
): number {
  if (
    typeof from.lat === "number" && typeof from.lng === "number" &&
    typeof to.lat === "number"   && typeof to.lng === "number"
  ) {
    return haversineMeters({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng });
  }
  if (
    typeof from.mapX === "number" && typeof from.mapY === "number" &&
    typeof to.mapX === "number"   && typeof to.mapY === "number"
  ) {
    const dx = to.mapX - from.mapX;
    const dy = to.mapY - from.mapY;
    return Math.round(Math.sqrt(dx * dx + dy * dy) * MAP_PX_TO_METERS);
  }
  return 0;
}

export function estimateDuration(distanceMeters: number, mode: string): number {
  const speed = SPEED_MS[mode] ?? SPEED_MS.WALKING;
  return Math.max(60, Math.round(distanceMeters / speed));
}

export function estimateCost(
  distanceMeters: number,
  mode: string,
  fuelPrice: number,
  fuelEfficiency: number,
): number | null {
  if (mode === "DRIVING") {
    const km = distanceMeters / 1000;
    return Math.round((km / fuelEfficiency) * fuelPrice * 100) / 100;
  }
  if (mode === "TRANSIT") {
    // Rough TWD-equivalent — 220/5km guess; replaced by Directions.fare.value in Phase 2
    return Math.max(60, Math.round((distanceMeters / 5000) * 220));
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recompute the Transport edge between two ScheduleItem ids in the same Day.
// Idempotent: if a Transport already exists for the from-item it is updated.
// ─────────────────────────────────────────────────────────────────────────────

export async function recalcTransport(
  fromItemId: string,
  toItemId: string,
  mode: "DRIVING" | "TRANSIT" | "WALKING" = "WALKING",
) {
  const [from, to, settings] = await Promise.all([
    prisma.scheduleItem.findUnique({
      where: { id: fromItemId },
      include: { place: true },
    }),
    prisma.scheduleItem.findUnique({
      where: { id: toItemId },
      include: { place: true },
    }),
    prisma.settings.findFirst(),
  ]);
  if (!from?.place || !to?.place) return null;

  const distance = estimateDistance(from.place, to.place);
  const duration = estimateDuration(distance, mode);
  const cost = estimateCost(
    distance,
    mode,
    settings?.defaultFuelPricePerLiter ?? 35,
    settings?.defaultFuelEfficiencyKmPerL ?? 15,
  );

  return prisma.transport.upsert({
    where: { fromScheduleItemId: fromItemId },
    update: {
      toScheduleItemId: toItemId,
      mode,
      distanceMeters: distance,
      durationSec: duration,
      estimatedCost: cost,
    },
    create: {
      fromScheduleItemId: fromItemId,
      toScheduleItemId: toItemId,
      mode,
      distanceMeters: distance,
      durationSec: duration,
      estimatedCost: cost,
    },
  });
}

// Recompute every Transport for a Day from its items' current order.
// Manually-edited Transports are preserved as long as the from→to pair stays
// the same; reordering or inserting items wipes them (intentional — the user's
// manual override applied to a different leg).
export async function recalcDayTransports(dayId: string) {
  const items = await prisma.scheduleItem.findMany({
    where: { dayId, isAllDay: false },
    orderBy: { orderIndex: "asc" },
    select: { id: true },
  });

  // Snapshot manual transports before we wipe — keyed by from→to pair.
  const manuals = await prisma.transport.findMany({
    where: {
      fromScheduleItemId: { in: items.map((i) => i.id) },
      manuallyEdited: true,
    },
  });
  const manualByPair = new Map<string, (typeof manuals)[number]>();
  for (const t of manuals) manualByPair.set(`${t.fromScheduleItemId}::${t.toScheduleItemId}`, t);

  await prisma.transport.deleteMany({
    where: { fromScheduleItemId: { in: items.map((i) => i.id) } },
  });

  for (let i = 0; i < items.length - 1; i++) {
    const fromId = items[i].id;
    const toId = items[i + 1].id;
    const preserved = manualByPair.get(`${fromId}::${toId}`);
    if (preserved) {
      // Restore the manual transport verbatim. The pair is still valid so the
      // user's overrides survive recalc — including the Phase 9 directions
      // cache (encoded polyline / fare / traffic / departure ISO).
      await prisma.transport.create({
        data: {
          fromScheduleItemId: fromId,
          toScheduleItemId: toId,
          mode: preserved.mode,
          distanceMeters: preserved.distanceMeters,
          durationSec: preserved.durationSec,
          polyline: preserved.polyline,
          parkingPlaceId: preserved.parkingPlaceId,
          estimatedCost: preserved.estimatedCost,
          manuallyEdited: true,
          notes: preserved.notes,
          transitLine: preserved.transitLine,
          transitDetailsJson: preserved.transitDetailsJson,
          originLabel: preserved.originLabel,
          destinationLabel: preserved.destinationLabel,
          aiGeneratedAt: preserved.aiGeneratedAt,
          encodedPolyline: preserved.encodedPolyline,
          directionsCacheJson: preserved.directionsCacheJson,
          directionsFetchedAt: preserved.directionsFetchedAt,
          modesSummaryJson: preserved.modesSummaryJson,
          departureAtIso: preserved.departureAtIso,
          trafficLevel: preserved.trafficLevel,
          fareCurrency: preserved.fareCurrency,
          fareAmount: preserved.fareAmount,
        },
      });
    } else {
      await recalcTransport(fromId, toId);
    }
  }

  // Phase 9 — after the basic Haversine pass settles, fire Directions
  // queries for every auto (non-manual) Transport in this Day in parallel.
  // Each query is independently best-effort: a failure (no key, quota
  // exceeded, blocked referer) just leaves the Haversine numbers in place.
  // Q1 = A: auto-query on add/reorder.
  await enrichDayTransportsWithDirections(dayId).catch(() => {
    /* never let directions errors break the recalc itself */
  });

  // Phase 10a — finally, recompute auto-derived Expense rows so Plan total
  // stays in sync with the new Transport.estimatedCost / fareAmount /
  // distance values. Wrapped in safe-helper so a recalc failure never
  // breaks the schedule mutation.
  await safeRecalcPlanFromDayId(dayId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — enrich auto transports with real Routes API data.
// Skipped silently when no Google Maps key is configured.
// ─────────────────────────────────────────────────────────────────────────────

export async function enrichDayTransportsWithDirections(dayId: string) {
  const apiKey = await getGoogleMapsKey();
  if (!apiKey) return; // No key = stick with Haversine; not an error.

  const transports = await prisma.transport.findMany({
    where: {
      manuallyEdited: false,
      fromItem: { dayId },
    },
    include: {
      fromItem: { include: { place: true, day: true } },
      toItem: { include: { place: true } },
    },
  });

  const tasks = transports.map(async (t) => {
    const fp = t.fromItem.place;
    const tp = t.toItem.place;
    if (!fp || !tp || fp.lat == null || fp.lng == null || tp.lat == null || tp.lng == null) {
      return; // Custom places without lat/lng — skip silently.
    }
    // Skip if mode is CUSTOM (user explicitly opted out of API queries).
    const mode = t.mode as InternalMode;
    if (mode === "CUSTOM") return;

    const dayDate = t.fromItem.day.date.toISOString().slice(0, 10);
    const dep = buildDepartureIso(dayDate, t.fromItem.endTime);

    // Cache check: if we already have a fresh response for the same
    // departure window (24h TTL), skip the API call.
    const fresh =
      t.directionsFetchedAt &&
      Date.now() - t.directionsFetchedAt.getTime() < 24 * 60 * 60 * 1000 &&
      t.departureAtIso === (dep ?? null) &&
      !!t.encodedPolyline;
    if (fresh) return;

    try {
      const result = await fetchDirections({
        fromLat: fp.lat,
        fromLng: fp.lng,
        toLat: tp.lat,
        toLng: tp.lng,
        mode: mode as "DRIVING" | "WALKING" | "TRANSIT" | "BICYCLING",
        ...(dep ? { departureAtIso: dep } : {}),
        fieldMask: "full",
      });
      await persistDirectionsToTransport(t.id, result);
      await prisma.transport.update({
        where: { id: t.id },
        data: { departureAtIso: dep ?? null },
      });
    } catch (err) {
      // Best-effort. Haversine fallback is already in place. Log on the
      // server so the operator can spot pattern (key invalid / quota / etc).
      console.warn(
        `[directions] enrich failed for transport ${t.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  await Promise.allSettled(tasks);
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual editing — set arbitrary fields on a Transport and lock it from the
// auto-recalc pipeline. Used by the TransportEditDialog (Phase 6b).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

export const transportUpdateSchema = z.object({
  mode: z.enum(["DRIVING", "TRANSIT", "WALKING", "BICYCLING", "CUSTOM"]).optional(),
  distanceMeters: z.number().int().min(0).max(1_000_000).optional(),
  durationSec: z.number().int().min(0).max(60 * 60 * 24).optional(),
  estimatedCost: z.number().min(0).max(1_000_000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  transitLine: z.string().max(500).nullable().optional(),
  transitDetailsJson: z.string().max(8000).nullable().optional(),
  originLabel: z.string().max(200).nullable().optional(),
  destinationLabel: z.string().max(200).nullable().optional(),
});
export type TransportUpdateInput = z.infer<typeof transportUpdateSchema>;

export async function updateTransport(id: string, input: TransportUpdateInput) {
  const parsed = transportUpdateSchema.parse(input);
  const result = await prisma.transport.update({
    where: { id },
    data: { ...parsed, manuallyEdited: true },
  });
  await safeRecalcPlanFromTransportId(id);
  return result;
}

// Reset to auto — drops the override and re-runs recalc for the whole day.
export async function resetTransportToAuto(id: string) {
  const t = await prisma.transport.findUnique({ where: { id } });
  if (!t) return;
  const item = await prisma.scheduleItem.findUnique({
    where: { id: t.fromScheduleItemId },
    select: { dayId: true },
  });
  if (!item) return;
  await prisma.transport.update({
    where: { id },
    data: {
      manuallyEdited: false,
      notes: null,
      transitLine: null,
      transitDetailsJson: null,
      originLabel: null,
      destinationLabel: null,
      aiGeneratedAt: null,
    },
  });
  await recalcDayTransports(item.dayId);
}

// AI auto-fill — write a structured suggestion onto the Transport. Used by
// the suggestTransport server action (Phase 6c). The result is treated as a
// manual override so subsequent recalc preserves it.
export async function applyAITransportSuggestion(
  id: string,
  suggestion: {
    mode: "DRIVING" | "TRANSIT" | "WALKING" | "BICYCLING" | "CUSTOM";
    distanceMeters?: number;
    durationSec?: number;
    estimatedCost?: number | null;
    notes?: string | null;
    transitLine?: string | null;
    transitDetailsJson?: string | null;
  },
) {
  const result = await prisma.transport.update({
    where: { id },
    data: {
      ...suggestion,
      manuallyEdited: true,
      aiGeneratedAt: new Date(),
    },
  });
  await safeRecalcPlanFromTransportId(id);
  return result;
}
