import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { suggestStayMinutes } from "./heuristic-stay";
import { recalcDayTransports } from "./transport-service";
import { safeRecalcPlanFromScheduleItemId } from "./expense-service";
import type { PlaceIconKey } from "@/lib/place-icon";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10c — kind-specific metadata writer.
//
// Each ScheduleItem.kind carries its own structured fields (price, booking
// ref, check-in time, flight number, ...) in `metadataJson`. The Zod schemas
// live in lib/schedule-item-metadata.ts; this service just persists.
// ─────────────────────────────────────────────────────────────────────────────

export async function updateScheduleItemMetadata(
  itemId: string,
  metadata: Record<string, unknown> | null,
  noteOverride?: string | null,
) {
  const data: { metadataJson: string | null; note?: string | null } = {
    metadataJson: metadata ? JSON.stringify(metadata) : null,
  };
  if (noteOverride !== undefined) data.note = noteOverride;
  const updated = await prisma.scheduleItem.update({ where: { id: itemId }, data });

  // Phase 10d — FLIGHT items cascade into check-in / immigration buddies
  // (TRANSPORT_STOP rows linked via parentFlightScheduleItemId).
  if (updated.kind === "FLIGHT") {
    const { expandFlightSchedule } = await import("./flight-service");
    await expandFlightSchedule(itemId);
  }

  // Recalc auto-Expense rows that derive from this item's metadata
  await safeRecalcPlanFromScheduleItemId(itemId);
}

// Phase 10h — change an existing item's kind in-place (景點 → 飛機 / 餐廳 / 住宿…).
// FLIGHT switch cascades to expandFlightSchedule; LODGING flips to all-day.
export async function updateScheduleItemKind(
  itemId: string,
  newKind:
    | "ATTRACTION"
    | "MEAL"
    | "LODGING"
    | "FREE"
    | "FLIGHT"
    | "CAR_RENTAL"
    | "TRAIN"
    | "TRANSPORT_STOP",
) {
  const before = await prisma.scheduleItem.findUnique({ where: { id: itemId } });
  if (!before) return;

  const data: { kind: string; isAllDay?: boolean; startTime?: string; endTime?: string } = {
    kind: newKind,
  };
  // LODGING is always all-day; switching back unsets it.
  if (newKind === "LODGING" && !before.isAllDay) {
    data.isAllDay = true;
    data.startTime = "00:00";
    data.endTime = "23:59";
  } else if (before.isAllDay && newKind !== "LODGING") {
    data.isAllDay = false;
  }

  await prisma.scheduleItem.update({ where: { id: itemId }, data });

  if (newKind === "FLIGHT") {
    const { expandFlightSchedule } = await import("./flight-service");
    await expandFlightSchedule(itemId);
  } else if (before.kind === "FLIGHT") {
    // Switching away from FLIGHT — drop any leftover buddy stops
    await prisma.scheduleItem.deleteMany({
      where: { parentFlightScheduleItemId: itemId },
    });
  }

  await recalcDayTransports(before.dayId);
  await safeRecalcPlanFromScheduleItemId(itemId);
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD over ScheduleItem; every mutation triggers Transport recalc for the
// affected Day so the editor never sees stale legs.
// ─────────────────────────────────────────────────────────────────────────────

export const scheduleItemAddSchema = z.object({
  dayId: z.string().min(1),
  placeId: z.string().min(1),
  kind: z.enum([
    "ATTRACTION",
    "MEAL",
    "LODGING",
    "FREE",
    "TRANSPORT_STOP",
    "FLIGHT",
    "CAR_RENTAL",
    "TRAIN",
  ]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isAllDay: z.boolean().optional().default(false),
});

const HHMM_RE = /^\d{2}:\d{2}$/;

function parseHM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}
function fmtHM(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export async function addScheduleItem(input: z.infer<typeof scheduleItemAddSchema>) {
  const parsed = scheduleItemAddSchema.parse(input);
  const place = await prisma.place.findUnique({ where: { googlePlaceId: parsed.placeId } });
  if (!place) throw new Error("找不到 Place");

  // Pick a default start time: continue right after the last item if any.
  const last = await prisma.scheduleItem.findFirst({
    where: { dayId: parsed.dayId, isAllDay: false },
    orderBy: { orderIndex: "desc" },
  });
  const desiredStart = parsed.startTime
    ? parseHM(parsed.startTime)
    : last
      ? parseHM(last.endTime) + 15 // 15-min buffer after previous block
      : 9 * 60;

  const stayMin = parsed.kind === "LODGING"
    ? 0 // all-day lodging
    : place.defaultStayMinutes ?? suggestStayMinutes((place.iconKey as PlaceIconKey) ?? "landmark");

  const startTime = parsed.isAllDay ? "00:00" : fmtHM(desiredStart);
  const endTime = parsed.isAllDay
    ? "23:59"
    : fmtHM(desiredStart + (stayMin || 60));

  const orderIndex = (last?.orderIndex ?? 0) + 1;

  const created = await prisma.scheduleItem.create({
    data: {
      dayId: parsed.dayId,
      placeId: parsed.placeId,
      kind: parsed.kind,
      startTime,
      endTime,
      durationMin: stayMin,
      suggestedDurationMin: stayMin,
      orderIndex,
      isAllDay: parsed.isAllDay ?? false,
    },
  });

  if (!created.isAllDay) await recalcDayTransports(parsed.dayId);
  return created;
}

export async function deleteScheduleItem(id: string) {
  const item = await prisma.scheduleItem.findUnique({ where: { id } });
  if (!item) return;
  await prisma.scheduleItem.delete({ where: { id } });
  if (!item.isAllDay) await recalcDayTransports(item.dayId);
}

// Reorder timed items within a single day. `orderedIds` is the new order from
// top to bottom; orderIndex starts at 1 (allDay items keep order 0 implicitly).
export async function reorderItemsInDay(dayId: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.scheduleItem.update({
        where: { id },
        data: { orderIndex: idx + 1 },
      }),
    ),
  );
  await recalcDayTransports(dayId);
}

// Move a timed item to a different Day (drag across days). New day appends
// to its end. Keep all other fields.
export async function moveItemToDay(itemId: string, targetDayId: string) {
  const target = await prisma.scheduleItem.findFirst({
    where: { dayId: targetDayId, isAllDay: false },
    orderBy: { orderIndex: "desc" },
  });
  const item = await prisma.scheduleItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const oldDayId = item.dayId;
  await prisma.scheduleItem.update({
    where: { id: itemId },
    data: { dayId: targetDayId, orderIndex: (target?.orderIndex ?? 0) + 1 },
  });
  if (oldDayId !== targetDayId) await recalcDayTransports(oldDayId);
  await recalcDayTransports(targetDayId);
}

// Update times (drag-resize support — Phase 1b will use this from week grid).
export async function updateItemTimes(itemId: string, startTime: string, endTime: string) {
  if (!HHMM_RE.test(startTime) || !HHMM_RE.test(endTime)) {
    throw new Error("時間格式錯誤");
  }
  const duration = Math.max(0, parseHM(endTime) - parseHM(startTime));
  const item = await prisma.scheduleItem.update({
    where: { id: itemId },
    data: { startTime, endTime, durationMin: duration },
  });
  if (!item.isAllDay) await recalcDayTransports(item.dayId);
  return item;
}
