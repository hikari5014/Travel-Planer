import "server-only";
import { prisma } from "@/lib/db";

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
export async function recalcDayTransports(dayId: string) {
  const items = await prisma.scheduleItem.findMany({
    where: { dayId, isAllDay: false },
    orderBy: { orderIndex: "asc" },
    select: { id: true },
  });
  // Drop existing transports for the day (cascade-safe via unique fromItemId).
  await prisma.transport.deleteMany({
    where: { fromScheduleItemId: { in: items.map((i) => i.id) } },
  });
  for (let i = 0; i < items.length - 1; i++) {
    await recalcTransport(items[i].id, items[i + 1].id);
  }
}
