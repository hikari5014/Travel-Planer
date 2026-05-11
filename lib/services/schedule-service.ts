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

// Phase 12f — batched edit ops fired by the optimistic week-view store.
// Each gesture emits one PendingOp; collected within a 600ms debounce window
// then committed in a single Prisma transaction with optimistic-version check.

export type DayEditOp =
  | { kind: "updateTimes"; itemId: string; startTime: string; endTime: string }
  | { kind: "moveToDay"; itemId: string; targetDayId: string };

export type CommitDayEditsResult =
  | {
      ok: true;
      version: number;
      // Caller refreshes its baseline from the revalidated tree; we don't
      // ship a full snapshot here to keep payload small.
    }
  | { ok: false; conflict: true; serverVersion: number }
  | { ok: false; error: string };

export async function commitDayEdits(
  dayId: string,
  ops: DayEditOp[],
  baseVersion: number,
): Promise<CommitDayEditsResult> {
  if (ops.length === 0) {
    const cur = await prisma.day.findUnique({ where: { id: dayId }, select: { version: true } });
    return { ok: true, version: cur?.version ?? 0 };
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const day = await tx.day.findUnique({
        where: { id: dayId },
        select: { id: true, version: true },
      });
      if (!day) throw new Error("找不到 Day");
      if (day.version !== baseVersion) {
        return { conflict: true as const, serverVersion: day.version };
      }
      // Apply ops in order. Cross-day moves shift the item to the target day's
      // tail (matching moveItemToDay semantics).
      for (const op of ops) {
        if (op.kind === "updateTimes") {
          if (!HHMM_RE.test(op.startTime) || !HHMM_RE.test(op.endTime)) continue;
          const duration = Math.max(0, parseHM(op.endTime) - parseHM(op.startTime));
          await tx.scheduleItem.update({
            where: { id: op.itemId },
            data: { startTime: op.startTime, endTime: op.endTime, durationMin: duration },
          });
        } else if (op.kind === "moveToDay") {
          // Re-locate to target day at tail.
          const tail = await tx.scheduleItem.findFirst({
            where: { dayId: op.targetDayId, isAllDay: false },
            orderBy: { orderIndex: "desc" },
            select: { orderIndex: true },
          });
          await tx.scheduleItem.update({
            where: { id: op.itemId },
            data: { dayId: op.targetDayId, orderIndex: (tail?.orderIndex ?? 0) + 1 },
          });
        }
      }
      const updated = await tx.day.update({
        where: { id: dayId },
        data: { version: { increment: 1 } },
        select: { version: true },
      });
      return { conflict: false as const, version: updated.version };
    });
    if ("conflict" in result && result.conflict) {
      return { ok: false, conflict: true, serverVersion: result.serverVersion };
    }
    // Recalc cascade for the day after batch commit (and target days for moves).
    const targetDayIds = new Set<string>([dayId]);
    for (const op of ops) {
      if (op.kind === "moveToDay") targetDayIds.add(op.targetDayId);
    }
    for (const id of targetDayIds) {
      await recalcDayTransports(id).catch(() => {
        /* swallow — cascade can fail on edge cases without breaking the commit */
      });
    }
    return { ok: true, version: result.version };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "commit 失敗" };
  }
}

// Phase 12d — split a Transport at the given time, inserting a new
// ScheduleItem (the picked place) in between. The original Transport keeps
// its mode/duration/isFree state on the FRONT segment (from oldFromItem →
// newItem); a new BACK segment (newItem → oldToItem) is created in `isFree`
// state since we don't know the new mode/duration yet.
export async function splitTransportAndInsertPlace(input: {
  transportId: string;
  googlePlaceId: string;
  kind: "ATTRACTION" | "MEAL" | "LODGING" | "FREE" | "TRANSPORT_STOP" | "FLIGHT" | "CAR_RENTAL" | "TRAIN";
  // Approximate insertion time (HH:MM). Default duration uses Place defaults.
  atTime: string;
}) {
  const place = await prisma.place.findUnique({ where: { googlePlaceId: input.googlePlaceId } });
  if (!place) throw new Error("找不到 Place");
  const oldT = await prisma.transport.findUnique({
    where: { id: input.transportId },
    include: { fromItem: true, toItem: true },
  });
  if (!oldT) throw new Error("找不到 Transport");

  const dayId = oldT.fromItem.dayId;
  const fromOrder = oldT.fromItem.orderIndex;
  const toOrder = oldT.toItem.orderIndex;
  // New item slots between the two; we shift later items down by 1.
  const newOrder = fromOrder + 1;

  const stayMin =
    place.defaultStayMinutes ?? suggestStayMinutes((place.iconKey as PlaceIconKey) ?? "landmark");
  const desiredStart = parseHM(input.atTime);
  const newItemStart = fmtHM(desiredStart);
  const newItemEnd = fmtHM(desiredStart + (stayMin || 60));

  await prisma.$transaction(async (tx) => {
    // 1) shift existing items at orderIndex >= newOrder one step down
    await tx.scheduleItem.updateMany({
      where: { dayId, orderIndex: { gte: newOrder } },
      data: { orderIndex: { increment: 1 } },
    });
    // 2) create the new item
    const created = await tx.scheduleItem.create({
      data: {
        dayId,
        placeId: input.googlePlaceId,
        kind: input.kind,
        startTime: newItemStart,
        endTime: newItemEnd,
        durationMin: stayMin,
        suggestedDurationMin: stayMin,
        orderIndex: newOrder,
        isAllDay: false,
      },
    });
    // 3) front segment: original Transport now points to the new item
    await tx.transport.update({
      where: { id: oldT.id },
      data: { toScheduleItemId: created.id },
    });
    // 4) back segment: new free Transport from new item → original to-item.
    //    isFree=true so cascade treats as 0-sec until user fills it in.
    await tx.transport.create({
      data: {
        fromScheduleItemId: created.id,
        toScheduleItemId: oldT.toScheduleItemId,
        mode: "WALKING", // placeholder, treated as 0-sec by cascade when isFree
        distanceMeters: 0,
        durationSec: 0,
        isFree: true,
      },
    });
    // 5) restore monotonic orderIndex (oldT.toItem was at toOrder; nothing
    //    actually breaks because we incremented everything ≥ newOrder by 1,
    //    so the to-item is now at toOrder+1, naturally placed AFTER newItem).
    void toOrder; // referenced for clarity; no extra DB write needed.
  });

  await recalcDayTransports(dayId);
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
