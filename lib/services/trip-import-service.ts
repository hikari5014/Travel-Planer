import "server-only";
import { prisma } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { resolvePlaceIcon, type PlaceIconKey } from "@/lib/place-icon";
import { suggestStayMinutes } from "./heuristic-stay";
import { recalcDayTransports } from "./transport-service";
import { importTripPayloadSchema, type ImportTripPayload } from "./trip-import-types";

// Phase 13 — External trip import pipeline.
//
// Used by both the JSON-paste path and the NL→JSON path (which produces the
// same shape via internal LLM). Steps:
//   1. Validate via Zod (importTripPayloadSchema)
//   2. Create Trip + default Plan + N Days (one per calendar day in the range,
//      same as the New-Trip flow)
//   3. For each day in the payload: find the matching Day row, then
//      a. for each item: create a custom Place (no Google ID) + ScheduleItem
//      b. for each transport: resolve fromIndex/toIndex to the created
//         ScheduleItem ids and create a Transport row
//   4. Run recalcDayTransports per day so cascade engine fills in any
//      missing times.
//
// Returns the new Trip's id so the caller can redirect.

export type ImportResult = {
  tripId: string;
  daysCreated: number;
  itemsCreated: number;
  transportsCreated: number;
  warnings: string[];
};

export async function importTripFromPayload(raw: unknown): Promise<ImportResult> {
  const parsed = importTripPayloadSchema.parse(raw);
  return importValidated(parsed);
}

async function importValidated(payload: ImportTripPayload): Promise<ImportResult> {
  // Validate inter-field constraints
  const tripStart = new Date(payload.trip.startDate + "T00:00:00Z");
  const tripEnd = new Date(payload.trip.endDate + "T00:00:00Z");
  if (tripEnd.getTime() < tripStart.getTime()) {
    throw new Error("endDate 不可早於 startDate");
  }

  const warnings: string[] = [];
  const user = await ensureCurrentUser();
  const userId = user.id;

  // Step 1: Trip + Plan + Days inside one transaction; we'll do per-item
  // inserts outside since Prisma transactions over many rows can hit time
  // limits on Neon free tier.
  const dayCount = Math.max(
    1,
    Math.round((tripEnd.getTime() - tripStart.getTime()) / 86400000) + 1,
  );

  const tripId = await prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data: {
        userId,
        title: payload.trip.title,
        startDate: tripStart,
        endDate: tripEnd,
        baseCurrency: payload.trip.baseCurrency,
        destination: payload.trip.destination ?? null,
        subtitle: payload.trip.subtitle ?? null,
        status: tripEnd < new Date() ? "past" : "active",
      },
    });
    const plan = await tx.plan.create({
      data: {
        tripId: trip.id,
        name: "預設方案",
        displayOrder: 0,
        pace: "標準",
        description: "由外部匯入。",
      },
    });
    await tx.trip.update({
      where: { id: trip.id },
      data: { defaultPlanId: plan.id },
    });
    await tx.day.createMany({
      data: Array.from({ length: dayCount }, (_, i) => ({
        planId: plan.id,
        dayIndex: i + 1,
        date: new Date(tripStart.getTime() + i * 86400000),
      })),
    });
    return trip.id;
  });

  // Re-fetch the days so we can map payload[].date → Day.id
  const tripWithDays = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      plans: {
        include: {
          days: { orderBy: { dayIndex: "asc" } },
        },
      },
    },
  });
  if (!tripWithDays) throw new Error("匯入後找不到 Trip");
  const defaultPlan = tripWithDays.plans[0];
  const daysByDateIso = new Map<string, string>();
  for (const d of defaultPlan.days) {
    daysByDateIso.set(d.date.toISOString().slice(0, 10), d.id);
  }

  // Step 2: items + transports per payload day
  let itemsCreated = 0;
  let transportsCreated = 0;
  const dayIdsTouched = new Set<string>();

  for (const payloadDay of payload.days) {
    const dayId = daysByDateIso.get(payloadDay.date);
    if (!dayId) {
      warnings.push(`日期 ${payloadDay.date} 不在 trip 範圍內，已略過該日 ${payloadDay.items.length} 個項目`);
      continue;
    }
    if (payloadDay.note) {
      await prisma.day.update({
        where: { id: dayId },
        data: { note: payloadDay.note },
      });
    }

    // Insert items in order; remember each item's DB id so transports can FK to them.
    const itemIdByIndex: string[] = [];
    let cursorMin = 9 * 60; // fallback start for first item if no startTime given

    for (let idx = 0; idx < payloadDay.items.length; idx++) {
      const it = payloadDay.items[idx];
      const iconKey = resolvePlaceIcon(it.kind === "MEAL" ? "restaurant" : "tourist_attraction") as PlaceIconKey;
      const stayMin =
        it.durationMin ?? suggestStayMinutes(iconKey) ?? 60;

      // Create a "local-" custom Place since we don't have a Google place_id.
      // Using same id format as createCustomPlace.
      const placeId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await prisma.place.create({
        data: {
          googlePlaceId: placeId,
          name: it.name,
          originalName: it.name,
          category: it.kind,
          address: it.address ?? null,
          iconKey,
          rating: null,
          ratingCount: null,
          lat: it.lat ?? null,
          lng: it.lng ?? null,
          defaultStayMinutes: stayMin,
          defaultStaySource: "HEURISTIC",
          fetchedAt: new Date(),
        },
      });

      const startMin = it.startTime ? parseHM(it.startTime) : cursorMin;
      const endMin = it.isAllDay ? 23 * 60 + 59 : startMin + stayMin;
      const startTime = it.isAllDay ? "00:00" : fmtHM(startMin);
      const endTime = it.isAllDay ? "23:59" : fmtHM(endMin);

      // Phase 14h — write kind-specific metadata if provided
      const metaJson = it.metadata ? JSON.stringify(it.metadata) : null;
      const created = await prisma.scheduleItem.create({
        data: {
          dayId,
          placeId,
          kind: it.kind,
          startTime,
          endTime,
          durationMin: it.isAllDay ? 0 : stayMin,
          suggestedDurationMin: stayMin,
          orderIndex: idx + 1,
          isAllDay: !!it.isAllDay,
          note: it.note ?? null,
          metadataJson: metaJson,
        },
      });
      itemIdByIndex.push(created.id);
      // Phase 14h — FLIGHT items run expandFlightSchedule to create
      // CHECK-IN / IMMIGRATION buddies if buffer fields are present.
      if (it.kind === "FLIGHT" && it.metadata) {
        const { expandFlightSchedule } = await import("./flight-service");
        await expandFlightSchedule(created.id).catch(() => {});
      }
      itemsCreated++;
      // 15-min buffer for fallback cascade if the next item has no startTime
      if (!it.isAllDay) cursorMin = endMin + 15;
    }

    // Insert transports — resolve fromIndex/toIndex to created ids
    for (const t of payloadDay.transports ?? []) {
      const fromId = itemIdByIndex[t.fromIndex];
      const toId = itemIdByIndex[t.toIndex];
      if (!fromId || !toId) {
        warnings.push(
          `${payloadDay.date}: transport fromIndex=${t.fromIndex} toIndex=${t.toIndex} 越界，已略過`,
        );
        continue;
      }
      const durationSec = t.durationMin != null ? t.durationMin * 60 : 0;
      const isFree = durationSec === 0; // no concrete time → free
      try {
        await prisma.transport.create({
          data: {
            fromScheduleItemId: fromId,
            toScheduleItemId: toId,
            mode: t.mode,
            distanceMeters: t.distanceM ?? 0,
            durationSec,
            isFree,
            fareAmount: t.fareAmount ?? null,
            fareCurrency: t.fareCurrency ?? null,
            transitLine: t.transitLine ?? null,
            estimatedCost: t.fareAmount ?? null,
            notes: t.notes ?? null,
            manuallyEdited: true, // imported = explicit user data, don't overwrite via Routes API
          },
        });
        transportsCreated++;
      } catch (e) {
        warnings.push(
          `${payloadDay.date}: transport ${t.fromIndex}→${t.toIndex} 建立失敗 (${e instanceof Error ? e.message : "未知錯誤"})`,
        );
      }
    }

    dayIdsTouched.add(dayId);
  }

  // Step 3: cascade per touched day (best-effort; failures don't break import)
  for (const dayId of dayIdsTouched) {
    await recalcDayTransports(dayId).catch((e) => {
      warnings.push(`日期 cascade 失敗 (${dayId}): ${e instanceof Error ? e.message : "未知錯誤"}`);
    });
  }

  return {
    tripId,
    daysCreated: dayIdsTouched.size,
    itemsCreated,
    transportsCreated,
    warnings,
  };
}

// Local HM helpers (duplicated from schedule-service to keep this module
// self-contained and avoid circular imports).
function parseHM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}
function fmtHM(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
