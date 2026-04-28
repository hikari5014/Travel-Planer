import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { CurrencyCode } from "@/lib/currency";

export const EXPENSE_CATEGORIES = ["FOOD", "LODGING", "TRANSPORT", "TICKET", "SHOPPING", "MISC"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const expenseCreateSchema = z.object({
  tripId: z.string().min(1),
  planId: z.string().min(1),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  currency: z.string().length(3),
  scheduleItemId: z.string().optional().nullable(),
  transportId: z.string().optional().nullable(),
  fxRateToBase: z.number().positive().optional().nullable(),
  note: z.string().max(200).optional().nullable(),
  occurredAt: z.string().optional().nullable(),
});

export type ExpenseCreateInput = z.input<typeof expenseCreateSchema>;

export async function createExpense(input: ExpenseCreateInput) {
  const parsed = expenseCreateSchema.parse(input);
  return prisma.expense.create({
    data: {
      tripId: parsed.tripId,
      planId: parsed.planId,
      category: parsed.category,
      amount: parsed.amount,
      currency: parsed.currency,
      scheduleItemId: parsed.scheduleItemId ?? null,
      transportId: parsed.transportId ?? null,
      fxRateToBase: parsed.fxRateToBase ?? null,
      note: parsed.note ?? null,
      occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
    },
  });
}

export async function deleteExpense(id: string) {
  return prisma.expense.delete({ where: { id } });
}

export async function updateExpenseAmount(id: string, amount: number) {
  return prisma.expense.update({ where: { id }, data: { amount } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregations for /expenses page
// ─────────────────────────────────────────────────────────────────────────────

export type ExpensesView = {
  trip: { id: string; title: string; baseCurrency: CurrencyCode };
  plans: { id: string; name: string; isDefault: boolean }[];
  rows: ExpenseRow[];
  totalsByCategory: Record<ExpenseCategory, number>;
  totalsByCurrency: Record<string, number>;
  totalsByDay: { date: string; dayIndex: number; amount: number }[];
  grandTotal: number;
};

export type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  fxRateToBase: number | null;
  note: string | null;
  occurredAt: string | null;
  scheduleItem: { id: string; placeName: string | null; dayIndex: number; date: string } | null;
  transport: { id: string; mode: string } | null;
  ticket: { id: string; title: string; bookingRef: string | null } | null;
};

export async function getExpensesView(tripId: string, planId?: string): Promise<ExpensesView | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { plans: { orderBy: { displayOrder: "asc" } } },
  });
  if (!trip) return null;

  const targetPlanId = planId ?? trip.defaultPlanId ?? trip.plans[0]?.id;
  if (!targetPlanId) {
    return {
      trip: { id: trip.id, title: trip.title, baseCurrency: trip.baseCurrency as CurrencyCode },
      plans: trip.plans.map((p) => ({ id: p.id, name: p.name, isDefault: p.id === trip.defaultPlanId })),
      rows: [],
      totalsByCategory: emptyCategoryTotals(),
      totalsByCurrency: {},
      totalsByDay: [],
      grandTotal: 0,
    };
  }

  const expenses = await prisma.expense.findMany({
    where: { tripId, planId: targetPlanId },
    include: {
      scheduleItem: {
        include: { place: { select: { name: true } }, day: { select: { dayIndex: true, date: true } } },
      },
      transport: { select: { id: true, mode: true } },
      ticket: { select: { id: true, title: true, bookingRef: true } },
    },
    orderBy: [{ category: "asc" }, { amount: "desc" }],
  });

  const totalsByCategory = emptyCategoryTotals();
  const totalsByCurrency: Record<string, number> = {};
  const totalsByDayMap = new Map<string, { dayIndex: number; date: string; amount: number }>();
  let grandTotal = 0;

  const rows: ExpenseRow[] = expenses.map((e) => {
    const inBase = (e.fxRateToBase && e.currency !== trip.baseCurrency)
      ? e.amount / e.fxRateToBase
      : e.amount;
    totalsByCategory[e.category as ExpenseCategory] = (totalsByCategory[e.category as ExpenseCategory] ?? 0) + inBase;
    totalsByCurrency[e.currency] = (totalsByCurrency[e.currency] ?? 0) + e.amount;
    grandTotal += inBase;
    if (e.scheduleItem?.day) {
      const key = e.scheduleItem.day.dayIndex.toString();
      const cur = totalsByDayMap.get(key) ?? { dayIndex: e.scheduleItem.day.dayIndex, date: e.scheduleItem.day.date.toISOString().slice(0, 10), amount: 0 };
      cur.amount += inBase;
      totalsByDayMap.set(key, cur);
    }
    return {
      id: e.id,
      category: e.category as ExpenseCategory,
      amount: e.amount,
      currency: e.currency,
      fxRateToBase: e.fxRateToBase,
      note: e.note,
      occurredAt: e.occurredAt ? e.occurredAt.toISOString() : null,
      scheduleItem: e.scheduleItem
        ? {
            id: e.scheduleItem.id,
            placeName: e.scheduleItem.place?.name ?? null,
            dayIndex: e.scheduleItem.day.dayIndex,
            date: e.scheduleItem.day.date.toISOString().slice(0, 10),
          }
        : null,
      transport: e.transport,
      ticket: e.ticket,
    };
  });

  return {
    trip: { id: trip.id, title: trip.title, baseCurrency: trip.baseCurrency as CurrencyCode },
    plans: trip.plans.map((p) => ({ id: p.id, name: p.name, isDefault: p.id === trip.defaultPlanId })),
    rows,
    totalsByCategory,
    totalsByCurrency,
    totalsByDay: [...totalsByDayMap.values()].sort((a, b) => a.dayIndex - b.dayIndex),
    grandTotal: Math.round(grandTotal),
  };
}

function emptyCategoryTotals(): Record<ExpenseCategory, number> {
  return { FOOD: 0, LODGING: 0, TRANSPORT: 0, TICKET: 0, SHOPPING: 0, MISC: 0 };
}
