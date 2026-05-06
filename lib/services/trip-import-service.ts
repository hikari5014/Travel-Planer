import "server-only";
import { prisma } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { resolvePlaceIcon, type PlaceIconKey } from "@/lib/place-icon";
import { suggestStayMinutes } from "./heuristic-stay";
import { recalcDayTransports } from "./transport-service";
import { importTripPayloadSchema, type ImportTripPayload } from "./trip-import-types";
import { placeDetailsByGoogleId, upsertPlaceFromGoogle } from "./place-service";
import { createFlightSegmentAtDay, type GooglePlaceLite } from "./add-item-service";

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

// Phase 14m commit 3 — single-day import. Imports payload.days[0] into the
// given Day. If the target day in the active plan has any items already,
// the active plan is forked into "方案 N" first and the import lands in the
// fork — the original is preserved for comparison.
//
// JSON `trip` block is intentionally ignored: caller already knows tripId.
// Mismatched currency / startDate / endDate in JSON are silently dropped
// with a warning. JSON with multiple days produces a warning and only the
// first day is used.
export type SingleDayImportResult = {
  newPlanId: string | null; // non-null when a fork was created
  planForked: boolean;
  itemsCreated: number;
  transportsCreated: number;
  warnings: string[];
};

export async function importSingleDayIntoPlan(
  tripId: string,
  planId: string,
  dayId: string,
  raw: unknown,
): Promise<SingleDayImportResult> {
  const parsed = importTripPayloadSchema.parse(raw);
  const warnings: string[] = [];

  // Resolve the target Day + own + scope
  const day = await prisma.day.findUnique({
    where: { id: dayId },
    include: { plan: { select: { id: true, tripId: true } } },
  });
  if (!day) throw new Error("找不到 Day");
  if (day.plan.id !== planId) throw new Error("Day 不屬於指定的方案");
  if (day.plan.tripId !== tripId) throw new Error("方案不屬於此 trip");

  if (parsed.days.length > 1) {
    warnings.push(`JSON 含 ${parsed.days.length} 天資料，僅匯入第一天 (${parsed.days[0].date})；其餘略過`);
  }
  const payloadDay = {
    ...parsed.days[0],
    // Override date to the target Day's actual date so a mismatch from the
    // LLM doesn't drop items; warn the user about the mismatch.
    date: day.date.toISOString().slice(0, 10),
  };
  if (parsed.days[0].date !== payloadDay.date) {
    warnings.push(`JSON 的日期 (${parsed.days[0].date}) 與目標日 (${payloadDay.date}) 不一致，已強制套用目標日`);
  }

  // Conflict check — does the day already have items?
  const existingCount = await prisma.scheduleItem.count({ where: { dayId } });
  if (existingCount === 0) {
    // No conflict, import in place
    const r = await importItemsIntoExistingDay(dayId, payloadDay, warnings);
    await recalcDayTransports(dayId).catch(() => {});
    return {
      newPlanId: null,
      planForked: false,
      itemsCreated: r.itemsCreated,
      transportsCreated: r.transportsCreated,
      warnings,
    };
  }

  // Conflict — fork the plan (per user's "auto comparison plan" decision)
  const { clonePlanForComparison } = await import("./plan-service");
  const newPlanId = await clonePlanForComparison(planId);

  // Find the matching Day in the fork (by dayIndex — they're aligned)
  const targetDayInFork = await prisma.day.findFirst({
    where: { planId: newPlanId, dayIndex: day.dayIndex },
  });
  if (!targetDayInFork) {
    throw new Error("複製方案後找不到對應日");
  }

  // Wipe the fork's day items (the ones we just cloned from the source);
  // cascade handles Transport / Ticket / Expense.
  await prisma.scheduleItem.deleteMany({ where: { dayId: targetDayInFork.id } });

  const r = await importItemsIntoExistingDay(targetDayInFork.id, payloadDay, warnings);
  await recalcDayTransports(targetDayInFork.id).catch(() => {});

  warnings.unshift(`原方案保留；當天行程匯入到新方案`);

  return {
    newPlanId,
    planForked: true,
    itemsCreated: r.itemsCreated,
    transportsCreated: r.transportsCreated,
    warnings,
  };
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
    const r = await importItemsIntoExistingDay(dayId, payloadDay, warnings);
    itemsCreated += r.itemsCreated;
    transportsCreated += r.transportsCreated;
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

// Phase 14m commit 3 — single-day import helper extracted from importValidated.
// Inserts items + transports into the given Day, returning counts. Caller is
// responsible for `recalcDayTransports(dayId)` afterwards (so caller can
// batch multiple days' recalcs together).
export async function importItemsIntoExistingDay(
  dayId: string,
  payloadDay: ImportTripPayload["days"][number],
  warnings: string[],
): Promise<{ itemsCreated: number; transportsCreated: number }> {
  let itemsCreated = 0;
  let transportsCreated = 0;

  if (payloadDay.note) {
    await prisma.day.update({
      where: { id: dayId },
      data: { note: payloadDay.note },
    });
  }

  // Insert items in order; remember each item's DB id so transports can FK to them.
  // For FLIGHT kind we record the dep item id so its index works for transports
  // (the arr item is implicit — created by createFlightSegmentAtDay).
  const itemIdByIndex: string[] = [];
  let cursorMin = 9 * 60; // fallback start for first item if no startTime given

  {
    for (let idx = 0; idx < payloadDay.items.length; idx++) {
      const it = payloadDay.items[idx];

      // Phase 14i — FLIGHT items: create 2 airport ScheduleItems (dep + arr)
      // + FLIGHT-mode Transport via the shared helper. The item index points
      // to the dep airport so user-supplied transports[] still resolve.
      if (it.kind === "FLIGHT" && it.metadata) {
        const m = it.metadata;
        if (m.depAirport && m.arrAirport && m.depTime && m.arrTime) {
          const depGoogle = m.depGooglePlaceId
            ? await fetchAirportGoogle(m.depGooglePlaceId, warnings).catch(() => null)
            : null;
          const arrGoogle = m.arrGooglePlaceId
            ? await fetchAirportGoogle(m.arrGooglePlaceId, warnings).catch(() => null)
            : null;
          try {
            const { depItemId } = await createFlightSegmentAtDay({
              dayId,
              date: payloadDay.date,
              flightNumber: m.flightNumber ?? "—",
              airline: m.airline ?? null,
              depAirport: m.depAirport,
              arrAirport: m.arrAirport,
              depTime: m.depTime,
              arrTime: m.arrTime,
              arrDateOffset: m.arrDateOffset,
              depTerminal: m.terminal ?? null,
              arrTerminal: m.arrTerminal ?? null,
              isInternational: m.isInternational ?? null,
              checkInBufferMin: m.checkInBufferMin ?? null,
              immigrationBufferMin: m.immigrationBufferMin ?? null,
              ticketPrice: m.ticketPrice ?? null,
              ticketCurrency: m.ticketCurrency ?? null,
              bookingRef: m.bookingRef ?? null,
              seatNumber: m.seatNumber ?? null,
              aircraftType: m.aircraftType ?? null,
              baggageAllowance: m.baggageAllowance ?? null,
              mealNote: m.mealNote ?? null,
              notes: it.note ?? null,
              depGooglePlace: depGoogle,
              arrGooglePlace: arrGoogle,
            });
            itemIdByIndex.push(depItemId);
            itemsCreated++;
            cursorMin = parseHM(m.arrTime) + 15;
            continue;
          } catch (e) {
            warnings.push(
              `${payloadDay.date}: FLIGHT 「${m.flightNumber ?? it.name}」建立失敗 (${e instanceof Error ? e.message : "未知錯誤"})，改用一般 item 建立`,
            );
            // Fall through to generic insert path
          }
        } else {
          warnings.push(
            `${payloadDay.date}: FLIGHT 「${it.name}」缺少 depAirport/arrAirport/depTime/arrTime，改用一般 item 建立`,
          );
        }
      }

      const iconKey = resolvePlaceIcon(it.kind === "MEAL" ? "restaurant" : "tourist_attraction") as PlaceIconKey;
      const stayMin =
        it.durationMin ?? suggestStayMinutes(iconKey) ?? 60;

      // Phase 14i — if AI supplied a googlePlaceId, fetch real Google details
      // and upsert. Otherwise fall back to a local-* custom Place.
      // Phase 14m — pass place-level enrichment fields through so the local
      // place row gets rating / summary / phone / website / priceLevel / tags
      // as supplied by the import payload. For Google-backed places we run a
      // follow-up update so user-supplied enrichment doesn't get clobbered
      // by — and doesn't blank out — Google's own fields.
      const enrichment = {
        rating: it.rating,
        ratingCount: it.ratingCount,
        summary: it.summary,
        phone: it.phone,
        website: it.website,
        priceLevel: it.priceLevel,
        tags: it.tags,
      };
      let placeId: string;
      if (it.googlePlaceId) {
        try {
          const detail = await placeDetailsByGoogleId(it.googlePlaceId);
          if (detail) {
            await upsertPlaceFromGoogle(detail);
            placeId = detail.googlePlaceId;
            // Apply user-supplied enrichment ONLY for fields the user provided
            // (per-field undefined guard). Never blanks Google data.
            const enrichUpdate: Record<string, unknown> = {};
            if (enrichment.summary !== undefined) enrichUpdate.summary = enrichment.summary;
            if (enrichment.phone !== undefined) enrichUpdate.phone = enrichment.phone;
            if (enrichment.website !== undefined) enrichUpdate.website = enrichment.website;
            if (enrichment.priceLevel !== undefined) enrichUpdate.priceLevel = enrichment.priceLevel;
            if (enrichment.tags && enrichment.tags.length > 0) {
              enrichUpdate.tags = JSON.stringify(enrichment.tags);
            }
            if (Object.keys(enrichUpdate).length > 0) {
              await prisma.place.update({ where: { googlePlaceId: placeId }, data: enrichUpdate });
            }
          } else {
            placeId = await createLocalPlace(it.name, it.kind, it.address, it.lat, it.lng, iconKey, stayMin, enrichment);
            warnings.push(`${payloadDay.date}: 「${it.name}」googlePlaceId 查無資料，改用自建地點`);
          }
        } catch (e) {
          placeId = await createLocalPlace(it.name, it.kind, it.address, it.lat, it.lng, iconKey, stayMin, enrichment);
          warnings.push(
            `${payloadDay.date}: 「${it.name}」Google Places 查詢失敗 (${e instanceof Error ? e.message : "未知"})，改用自建地點`,
          );
        }
      } else {
        placeId = await createLocalPlace(it.name, it.kind, it.address, it.lat, it.lng, iconKey, stayMin, enrichment);
      }

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
  }

  return { itemsCreated, transportsCreated };
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

async function createLocalPlace(
  name: string,
  kind: string,
  address: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
  iconKey: PlaceIconKey,
  stayMin: number,
  // Phase 14m — optional enrichment fields from import payload
  enrichment?: {
    rating?: number;
    ratingCount?: number;
    summary?: string;
    phone?: string;
    website?: string;
    priceLevel?: number;
    tags?: string[];
  },
): Promise<string> {
  const placeId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await prisma.place.create({
    data: {
      googlePlaceId: placeId,
      name,
      originalName: name,
      category: kind,
      address: address ?? null,
      iconKey,
      rating: enrichment?.rating ?? null,
      ratingCount: enrichment?.ratingCount ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
      defaultStayMinutes: stayMin,
      defaultStaySource: "HEURISTIC",
      summary: enrichment?.summary ?? null,
      phone: enrichment?.phone ?? null,
      website: enrichment?.website ?? null,
      priceLevel: enrichment?.priceLevel ?? null,
      tags: enrichment?.tags && enrichment.tags.length > 0 ? JSON.stringify(enrichment.tags) : null,
      fetchedAt: new Date(),
    },
  });
  return placeId;
}

// Fetch airport details from Google → shape into the lite type addFlight
// helper consumes. Returns null if Google key is missing or lookup fails.
async function fetchAirportGoogle(
  googlePlaceId: string,
  warnings: string[],
): Promise<GooglePlaceLite | null> {
  try {
    const detail = await placeDetailsByGoogleId(googlePlaceId);
    if (!detail) {
      warnings.push(`機場 ${googlePlaceId} 查無 Google 資料，改用 IATA 內建表`);
      return null;
    }
    return {
      googlePlaceId: detail.googlePlaceId,
      name: detail.name,
      category: "機場",
      address: detail.address,
      rating: detail.rating,
      ratingCount: detail.ratingCount ?? null,
      iconKey: "airport",
      lat: detail.lat,
      lng: detail.lng,
    };
  } catch (e) {
    warnings.push(
      `機場 ${googlePlaceId} 查詢失敗 (${e instanceof Error ? e.message : "未知"})`,
    );
    return null;
  }
}
