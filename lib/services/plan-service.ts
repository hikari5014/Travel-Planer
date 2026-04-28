import "server-only";
import { prisma } from "@/lib/db";

// duplicatePlan: deep clone Plan → Day → ScheduleItem → Transport → Ticket →
// Expense. Place rows are *not* duplicated (shared cache).
export async function duplicatePlan(sourcePlanId: string, newName?: string): Promise<string> {
  const src = await prisma.plan.findUnique({
    where: { id: sourcePlanId },
    include: {
      days: {
        include: {
          scheduleItems: {
            include: {
              tickets: { include: { expense: true } },
              outgoingTransport: { include: { expenses: true } },
              expenses: true,
            },
          },
        },
      },
    },
  });
  if (!src) throw new Error("找不到來源 Plan");

  return prisma.$transaction(async (tx) => {
    const lastOrder = await tx.plan.findFirst({
      where: { tripId: src.tripId },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });
    const newPlan = await tx.plan.create({
      data: {
        tripId: src.tripId,
        name: newName ?? `${src.name} (副本)`,
        displayOrder: (lastOrder?.displayOrder ?? 0) + 1,
        forkedFromPlanId: src.id,
        pace: src.pace,
        description: src.description,
      },
    });

    // Day → item → transport mapping (old id → new id)
    const itemIdMap = new Map<string, string>();

    for (const d of src.days) {
      const newDay = await tx.day.create({
        data: { planId: newPlan.id, date: d.date, dayIndex: d.dayIndex, note: d.note },
      });
      for (const it of d.scheduleItems) {
        const newItem = await tx.scheduleItem.create({
          data: {
            dayId: newDay.id,
            kind: it.kind,
            placeId: it.placeId,
            startTime: it.startTime,
            endTime: it.endTime,
            durationMin: it.durationMin,
            suggestedDurationMin: it.suggestedDurationMin,
            isAllDay: it.isAllDay,
            isTimeLocked: it.isTimeLocked,
            orderIndex: it.orderIndex,
            note: it.note,
          },
        });
        itemIdMap.set(it.id, newItem.id);
        // Tickets + their 1:1 Expenses
        for (const t of it.tickets) {
          const newExpense = await tx.expense.create({
            data: {
              tripId: src.tripId,
              planId: newPlan.id,
              scheduleItemId: newItem.id,
              category: "TICKET",
              amount: t.expense.amount,
              currency: t.expense.currency,
              fxRateToBase: t.expense.fxRateToBase,
            },
          });
          await tx.ticket.create({
            data: {
              scheduleItemId: newItem.id,
              category: t.category,
              title: t.title,
              price: t.price,
              currency: t.currency,
              quantity: t.quantity,
              bookingRef: t.bookingRef,
              fileAttachmentPath: t.fileAttachmentPath,
              expenseId: newExpense.id,
            },
          });
        }
        // Non-ticket expenses tied to this item
        for (const ex of it.expenses) {
          if (ex.category === "TICKET") continue; // already cloned via ticket
          await tx.expense.create({
            data: {
              tripId: src.tripId,
              planId: newPlan.id,
              scheduleItemId: newItem.id,
              category: ex.category,
              amount: ex.amount,
              currency: ex.currency,
              fxRateToBase: ex.fxRateToBase,
              note: ex.note,
            },
          });
        }
      }
    }

    // Re-walk transports now that itemIdMap is populated
    for (const d of src.days) {
      for (const it of d.scheduleItems) {
        const t = it.outgoingTransport;
        if (!t) continue;
        const newFromId = itemIdMap.get(t.fromScheduleItemId);
        const newToId = itemIdMap.get(t.toScheduleItemId);
        if (!newFromId || !newToId) continue;
        const newTransport = await tx.transport.create({
          data: {
            fromScheduleItemId: newFromId,
            toScheduleItemId: newToId,
            mode: t.mode,
            distanceMeters: t.distanceMeters,
            durationSec: t.durationSec,
            polyline: t.polyline,
            parkingPlaceId: t.parkingPlaceId,
            estimatedCost: t.estimatedCost,
          },
        });
        // Clone TRANSPORT expenses linked to this transport
        for (const ex of t.expenses) {
          await tx.expense.create({
            data: {
              tripId: src.tripId,
              planId: newPlan.id,
              transportId: newTransport.id,
              category: "TRANSPORT",
              amount: ex.amount,
              currency: ex.currency,
              fxRateToBase: ex.fxRateToBase,
              note: ex.note,
            },
          });
        }
      }
    }

    // Top-level expenses on the source Plan (not tied to any item/transport)
    const topLevel = await tx.expense.findMany({
      where: {
        planId: sourcePlanId,
        scheduleItemId: null,
        transportId: null,
      },
    });
    for (const ex of topLevel) {
      await tx.expense.create({
        data: {
          tripId: src.tripId,
          planId: newPlan.id,
          category: ex.category,
          amount: ex.amount,
          currency: ex.currency,
          fxRateToBase: ex.fxRateToBase,
          note: ex.note,
        },
      });
    }

    return newPlan.id;
  });
}

export async function deletePlan(planId: string) {
  // Don't let the user nuke the trip's defaultPlanId without re-pointing it.
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return;
  const trip = await prisma.trip.findUnique({ where: { id: plan.tripId } });
  await prisma.plan.delete({ where: { id: planId } });
  if (trip?.defaultPlanId === planId) {
    const next = await prisma.plan.findFirst({
      where: { tripId: plan.tripId },
      orderBy: { displayOrder: "asc" },
    });
    await prisma.trip.update({
      where: { id: plan.tripId },
      data: { defaultPlanId: next?.id ?? null },
    });
  }
}

export async function setDefaultPlan(tripId: string, planId: string) {
  await prisma.trip.update({ where: { id: tripId }, data: { defaultPlanId: planId } });
}
