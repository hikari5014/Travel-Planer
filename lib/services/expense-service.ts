import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { convertToBase, type CurrencyCode } from "@/lib/currency";
import { getCurrentUserId } from "@/lib/auth/current-user";

export const EXPENSE_CATEGORIES = ["FOOD", "LODGING", "TRANSPORT", "TICKET", "SHOPPING", "MISC", "FLIGHT"] as const;
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
  // Phase 14m fix — if caller didn't snapshot a rate, look up the user's
  // current Settings.fxRates so the row records its conversion at creation.
  let fxRateToBase = parsed.fxRateToBase ?? null;
  if (!fxRateToBase) {
    fxRateToBase = await resolveFxRateForCurrency(parsed.tripId, parsed.currency);
  }
  return prisma.expense.create({
    data: {
      tripId: parsed.tripId,
      planId: parsed.planId,
      category: parsed.category,
      amount: parsed.amount,
      currency: parsed.currency,
      scheduleItemId: parsed.scheduleItemId ?? null,
      transportId: parsed.transportId ?? null,
      fxRateToBase,
      note: parsed.note ?? null,
      occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
    },
  });
}

// Phase 14m fix — resolve fxRateToBase from current user's Settings.fxRates
// for a given (currency, tripBaseCurrency) pair. Returns null when no
// conversion is needed (currency === base) or no rate is available.
async function resolveFxRateForCurrency(tripId: string, currency: string): Promise<number | null> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { baseCurrency: true } });
  if (!trip) return null;
  if (currency === trip.baseCurrency) return null;
  const userId = await getCurrentUserId();
  const settings = await prisma.settings.findUnique({ where: { id: userId }, select: { fxRates: true } });
  if (!settings?.fxRates) return null;
  try {
    const rates = JSON.parse(settings.fxRates) as Record<string, number>;
    const r = rates[currency];
    return typeof r === "number" && r > 0 ? r : null;
  } catch {
    return null;
  }
}

export async function deleteExpense(id: string) {
  return prisma.expense.delete({ where: { id } });
}

export async function updateExpenseAmount(id: string, amount: number) {
  return prisma.expense.update({ where: { id }, data: { amount } });
}

// Phase 14m fix — backfill fxRateToBase for legacy Expense rows (anything
// created before the recalcPlanExpenses fix). Uses the user's current
// Settings.fxRates as the snapshot. Returns the count of rows updated.
// Idempotent — only touches rows where fxRateToBase IS NULL.
export async function backfillExpenseFxRates(tripId?: string): Promise<{ updated: number }> {
  const userId = await getCurrentUserId();
  const settings = await prisma.settings.findUnique({ where: { id: userId }, select: { fxRates: true } });
  const rates: Record<string, number> = (() => {
    try {
      const r = settings?.fxRates ? JSON.parse(settings.fxRates) : {};
      return typeof r === "object" && r ? r : {};
    } catch {
      return {};
    }
  })();

  const where: Record<string, unknown> = { fxRateToBase: null };
  if (tripId) where.tripId = tripId;
  // Need baseCurrency per trip → load expenses + their trip's baseCurrency.
  const rows = await prisma.expense.findMany({
    where,
    select: { id: true, currency: true, trip: { select: { baseCurrency: true } } },
  });
  let updated = 0;
  for (const r of rows) {
    if (r.currency === r.trip.baseCurrency) continue;
    const rate = rates[r.currency];
    if (typeof rate !== "number" || !(rate > 0)) continue;
    await prisma.expense.update({ where: { id: r.id }, data: { fxRateToBase: rate } });
    updated++;
  }
  return { updated };
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
  // Phase 14m fix — surfaced for the page-level fallback when a row's
  // saved fxRateToBase is null (legacy data).
  fxRates: Record<string, number>;
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
      fxRates: {},
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

  // Phase 14m fix — load current FX rates as a fallback for rows whose
  // fxRateToBase was never snapshotted (legacy data created before the
  // recalcPlanExpenses fix). Without this, ¥3,000 keeps rendering as
  // NT$ 3,000 until the user triggers a schedule mutation that re-runs
  // recalcPlanExpenses.
  const userId = await getCurrentUserId();
  const settings = await prisma.settings.findUnique({ where: { id: userId }, select: { fxRates: true } });
  const liveFxRates: Record<string, number> = (() => {
    try {
      const r = settings?.fxRates ? JSON.parse(settings.fxRates) : {};
      return typeof r === "object" && r ? r : {};
    } catch {
      return {};
    }
  })();
  const rows: ExpenseRow[] = expenses.map((e) => {
    const inBase = convertToBase(e.amount, e.currency, trip.baseCurrency, e.fxRateToBase, liveFxRates);
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
    fxRates: liveFxRates,
  };
}

function emptyCategoryTotals(): Record<ExpenseCategory, number> {
  return { FOOD: 0, LODGING: 0, TRANSPORT: 0, TICKET: 0, SHOPPING: 0, MISC: 0, FLIGHT: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10a — recalcPlanExpenses
//
// Wipes + rebuilds all `isAuto: true` Expense rows from the structured data
// the user has entered (Transport.estimatedCost, ScheduleItem.metadataJson,
// Ticket prices, driving fuel cost). User-entered (`isAuto: false`) rows are
// untouched. Triggered after every schedule mutation that could change cost
// (item add/remove, transport edit/refresh, metadata save).
// ─────────────────────────────────────────────────────────────────────────────

export async function recalcPlanExpenses(planId: string): Promise<void> {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      trip: { select: { id: true, baseCurrency: true } },
      days: {
        include: {
          scheduleItems: {
            include: {
              outgoingTransport: true,
              tickets: { include: { expense: true } },
            },
          },
        },
      },
    },
  });
  if (!plan) return;
  const tripId = plan.tripId;

  // Per-user fuel settings — scope to current user. Phase 11.5: was
  // findFirst() (arbitrary row in multi-user mode on Vercel).
  const userId = await getCurrentUserId();
  const settings = await prisma.settings.findUnique({ where: { id: userId } });
  const fuelPrice = settings?.defaultFuelPricePerLiter ?? 35;
  const fuelEff = settings?.defaultFuelEfficiencyKmPerL ?? 15;
  // Phase 14m fix — snapshot the user's current FX rates onto every auto
  // Expense row so the cost overview stops showing ¥3,000 as NT$ 3,000.
  const fxRates: Record<string, number> = (() => {
    try {
      const r = settings?.fxRates ? JSON.parse(settings.fxRates) : {};
      return typeof r === "object" && r ? r : {};
    } catch {
      return {};
    }
  })();
  const baseCur = plan.trip.baseCurrency;
  const fxFor = (cur: string): number | null => {
    if (cur === baseCur) return null;
    const r = fxRates[cur];
    return typeof r === "number" && r > 0 ? r : null;
  };

  await prisma.$transaction(async (tx) => {
    // Wipe existing auto expenses for this plan
    await tx.expense.deleteMany({ where: { planId, isAuto: true } });

    const inserts: Array<{
      tripId: string;
      planId: string;
      category: string;
      amount: number;
      currency: string;
      autoSource: string;
      isAuto: boolean;
      scheduleItemId?: string;
      transportId?: string;
      note?: string;
    }> = [];

    for (const day of plan.days) {
      for (const item of day.scheduleItems) {
        // ─ Transport-derived expenses ─
        const t = item.outgoingTransport;
        if (t) {
          // 1. TRANSIT fare (auto-pulled from Routes API + persisted on
          //    Transport.fareAmount/fareCurrency, falls back to estimatedCost)
          if (t.mode === "TRANSIT" && t.fareAmount != null && t.fareAmount > 0) {
            inserts.push({
              tripId,
              planId,
              category: "TRANSPORT",
              amount: t.fareAmount,
              currency: t.fareCurrency ?? plan.trip.baseCurrency,
              autoSource: "TRANSPORT_FARE",
              isAuto: true,
              transportId: t.id,
              note: t.transitLine ?? "大眾運輸",
            });
          } else if (t.mode === "DRIVING" && t.distanceMeters && t.distanceMeters > 0) {
            // 2. DRIVING fuel — Phase 10e: distance/efficiency × price
            const km = t.distanceMeters / 1000;
            const fuel = (km / fuelEff) * fuelPrice;
            if (fuel > 0) {
              inserts.push({
                tripId,
                planId,
                category: "TRANSPORT",
                amount: Math.round(fuel * 100) / 100,
                currency: plan.trip.baseCurrency,
                autoSource: "TRANSPORT_FUEL",
                isAuto: true,
                transportId: t.id,
                note: `油費估算 ${km.toFixed(1)}km / ${fuelEff}km/L / ${fuelPrice}/L`,
              });
            }
          } else if (
            t.mode === "TAXI" &&
            t.fareAmount != null &&
            t.fareAmount > 0
          ) {
            // Phase 11 — TAXI estimated fare (from Settings region rate × distance/duration)
            inserts.push({
              tripId,
              planId,
              category: "TRANSPORT",
              amount: t.fareAmount,
              currency: t.fareCurrency ?? plan.trip.baseCurrency,
              autoSource: "TAXI_FARE",
              isAuto: true,
              transportId: t.id,
              note: "計程車估算",
            });
          } else if (
            (t.mode === "WALKING" || t.mode === "BICYCLING") &&
            t.estimatedCost != null &&
            t.estimatedCost > 0
          ) {
            // Walk/bike rarely have cost but respect user override
            inserts.push({
              tripId,
              planId,
              category: "TRANSPORT",
              amount: t.estimatedCost,
              currency: plan.trip.baseCurrency,
              autoSource: "TRANSPORT_FARE",
              isAuto: true,
              transportId: t.id,
            });
          } else if (t.estimatedCost != null && t.estimatedCost > 0) {
            // CUSTOM mode — honour the manual estimatedCost
            inserts.push({
              tripId,
              planId,
              category: "TRANSPORT",
              amount: t.estimatedCost,
              currency: plan.trip.baseCurrency,
              autoSource: "TRANSPORT_FARE",
              isAuto: true,
              transportId: t.id,
            });
          }

          // Phase 14a — FLIGHT mode Transport: pull ticketPrice from
          // metadataJson into a FLIGHT-category expense. Without this branch
          // a Transport segment with mode=FLIGHT never produces an expense
          // even though TransportEditDialogV2's flight form writes
          // ticketPrice into transport.metadataJson. This is the bug
          // surfaced as "機票價格還沒有跟費用當中的機票對接到".
          if (t.mode === "FLIGHT" && t.metadataJson) {
            try {
              const m = JSON.parse(t.metadataJson) as Record<string, unknown>;
              const price =
                typeof m.ticketPrice === "number" && m.ticketPrice > 0 ? m.ticketPrice : 0;
              const currencyRaw =
                (typeof m.ticketCurrency === "string" && m.ticketCurrency) ||
                (typeof m.currency === "string" && m.currency) ||
                "";
              const flightNum = typeof m.flightNumber === "string" ? m.flightNumber : "";
              if (price > 0) {
                inserts.push({
                  tripId,
                  planId,
                  category: "FLIGHT",
                  amount: price,
                  currency: currencyRaw || plan.trip.baseCurrency,
                  autoSource: "FLIGHT_TICKET",
                  isAuto: true,
                  transportId: t.id,
                  note: flightNum || "機票",
                });
              }
            } catch {
              /* ignore malformed metadata */
            }
          }
        }

        // ─ ScheduleItem metadata-derived expenses ─
        // metadataJson may carry kind-specific cost fields (Phase 10c). We
        // surface them as auto Expense rows here. Manual edits to those
        // expense rows would be lost on recalc — but since user-edits should
        // happen via the metadata form (not /expenses page directly), this
        // is the source of truth.
        const meta = parseMetadata(item.metadataJson);
        if (meta) {
          const kindEntries = pickMetadataExpenses(item.kind, meta, plan.trip.baseCurrency);
          for (const entry of kindEntries) {
            inserts.push({
              tripId,
              planId,
              category: entry.category,
              amount: entry.amount,
              currency: entry.currency,
              autoSource: entry.autoSource,
              isAuto: true,
              scheduleItemId: item.id,
              ...(entry.note ? { note: entry.note } : {}),
            });
          }
        }

        // ─ Ticket-derived expenses are already 1:1 via Ticket.expenseId
        //   (existing flow, untouched). They're NOT marked isAuto so they
        //   survive recalc. The ticket-service should ensure manual deletes
        //   sync. We do nothing here for tickets.
      }
    }

    if (inserts.length > 0) {
      // Phase 14m fix — snapshot fxRateToBase from user's current
      // Settings.fxRates onto every row at insert time (was permanently
      // null before, which made the cost overview show ¥3,000 as NT$ 3,000).
      const enriched = inserts.map((row) => ({ ...row, fxRateToBase: fxFor(row.currency) }));
      await tx.expense.createMany({ data: enriched });
    }
  });
}

// Helpers ----------------------------------------------------------------

function parseMetadata(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json);
    return typeof o === "object" && o ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type DerivedExpense = {
  category: ExpenseCategory;
  amount: number;
  currency: string;
  autoSource: string;
  note?: string;
};

// Maps each ScheduleItem.kind's metadata to derived Expense rows.
// Kept in this service so adding a new kind only touches schedule-item-
// metadata.ts (Zod schemas) + this switch.
function pickMetadataExpenses(
  kind: string,
  meta: Record<string, unknown>,
  baseCurrency: string,
): DerivedExpense[] {
  const out: DerivedExpense[] = [];
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

  if (kind === "ATTRACTION") {
    // Phase 14 — multi-tier tickets first; sum each tier's unitPrice × quantity.
    // Falls back to the legacy single-ticket flat price.
    const tiers = Array.isArray(meta.tickets) ? (meta.tickets as Array<{ unitPrice?: number; quantity?: number }>) : null;
    if (tiers && tiers.length > 0) {
      const total = tiers.reduce((s, t) => {
        const p = typeof t.unitPrice === "number" ? t.unitPrice : 0;
        const q = typeof t.quantity === "number" ? t.quantity : 1;
        return s + p * q;
      }, 0);
      if (total > 0) {
        out.push({
          category: "TICKET",
          amount: total,
          currency: str(meta.ticketCurrency) ?? baseCurrency,
          autoSource: "ATTRACTION_TICKET",
        });
      }
    } else {
      const fee = num(meta.ticketPrice);
      if (fee) {
        out.push({
          category: "TICKET",
          amount: fee,
          currency: str(meta.ticketCurrency) ?? baseCurrency,
          autoSource: "ATTRACTION_TICKET",
        });
      }
    }
  } else if (kind === "MEAL") {
    // Phase 14 — averagePrice × partySize when both present (matches the
    // form's "每人 × N 人 = total" UX). Falls back to per-person amount.
    const perPerson = num(meta.averagePrice);
    const partySize = num(meta.partySize);
    if (perPerson) {
      const total = partySize ? perPerson * partySize : perPerson;
      out.push({
        category: "FOOD",
        amount: total,
        currency: str(meta.ticketCurrency) ?? str(meta.currency) ?? baseCurrency,
        autoSource: "MEAL_BUDGET",
      });
    }
  } else if (kind === "LODGING") {
    // Phase 14 — only the first night's stub owns the totalCost expense
    // (multi-night LODGING creates one stub per night to occupy the
    // schedule but they share a single booking total).
    const isFirstNight = meta.isFirstNight !== false; // default true for legacy single-night data
    const total = num(meta.totalCost);
    if (total && isFirstNight) {
      out.push({
        category: "LODGING",
        amount: total,
        currency: str(meta.ticketCurrency) ?? str(meta.currency) ?? baseCurrency,
        autoSource: "LODGING_TOTAL",
      });
    }
  } else if (kind === "CAR_RENTAL") {
    // Phase 14 — only the PICKUP segment owns the totalCost expense
    // (RETURN is a sibling stub with the same booking).
    const role = str(meta.segmentRole);
    const isPickup = role !== "RETURN"; // default true for legacy single-segment data
    // Phase 14 — total = (dailyRate × rentalDays) + (insurancePerDay × days) + addOnTotal
    let total = num(meta.totalCost);
    if (!total && isPickup) {
      const daily = num(meta.dailyRate);
      const days = num(meta.rentalDays);
      const insPerDay = num(meta.insurancePerDay) ?? 0;
      const addOns = num(meta.addOnTotal) ?? 0;
      if (daily && days) total = daily * days + insPerDay * days + addOns;
    }
    if (total && isPickup) {
      out.push({
        category: "TRANSPORT",
        amount: total,
        currency: str(meta.ticketCurrency) ?? str(meta.currency) ?? baseCurrency,
        autoSource: "CAR_RENTAL_TOTAL",
        note: "租車費用",
      });
    }
  } else if (kind === "FLIGHT") {
    const price = num(meta.ticketPrice);
    if (price) {
      out.push({
        category: "FLIGHT",
        amount: price,
        currency: str(meta.ticketCurrency) ?? str(meta.currency) ?? baseCurrency,
        autoSource: "FLIGHT_TICKET",
        note: str(meta.flightNumber) ?? "機票",
      });
    }
  } else if (kind === "TRAIN") {
    const price = num(meta.ticketPrice);
    if (price) {
      out.push({
        category: "TRANSPORT",
        amount: price,
        currency: str(meta.ticketCurrency) ?? str(meta.currency) ?? baseCurrency,
        autoSource: "TRANSPORT_FARE",
        note: str(meta.trainNumber) ?? "鐵路票",
      });
    }
  } else if (kind === "FREE") {
    const budget = num(meta.budget);
    if (budget) {
      out.push({
        category: "MISC",
        amount: budget,
        currency: str(meta.currency) ?? baseCurrency,
        autoSource: "FREE_BUDGET",
      });
    }
  }
  return out;
}

// Convenience — recalc all plans of a trip (used after trip-wide changes).
export async function recalcTripExpenses(tripId: string): Promise<void> {
  const plans = await prisma.plan.findMany({ where: { tripId }, select: { id: true } });
  for (const p of plans) await recalcPlanExpenses(p.id);
}

// Resolve planId from any of dayId / scheduleItemId / transportId. Used by
// callers that need to invoke recalc but only know one of these handles.
export async function resolvePlanIdFromDay(dayId: string): Promise<string | null> {
  const d = await prisma.day.findUnique({ where: { id: dayId }, select: { planId: true } });
  return d?.planId ?? null;
}
export async function resolvePlanIdFromScheduleItem(itemId: string): Promise<string | null> {
  const it = await prisma.scheduleItem.findUnique({
    where: { id: itemId },
    select: { day: { select: { planId: true } } },
  });
  return it?.day.planId ?? null;
}
export async function resolvePlanIdFromTransport(transportId: string): Promise<string | null> {
  const t = await prisma.transport.findUnique({
    where: { id: transportId },
    select: { fromItem: { select: { day: { select: { planId: true } } } } },
  });
  return t?.fromItem.day.planId ?? null;
}

// Fire-and-forget helper — kicks off recalc for one plan / one day, never
// throws. Used at the tail of mutation services so a recalc failure can't
// break the user-facing action. Errors are logged server-side.
export async function safeRecalcPlanFromDayId(dayId: string): Promise<void> {
  try {
    const planId = await resolvePlanIdFromDay(dayId);
    if (planId) await recalcPlanExpenses(planId);
  } catch (e) {
    console.warn("[recalc] plan from dayId failed:", e);
  }
}
export async function safeRecalcPlanFromTransportId(transportId: string): Promise<void> {
  try {
    const planId = await resolvePlanIdFromTransport(transportId);
    if (planId) await recalcPlanExpenses(planId);
  } catch (e) {
    console.warn("[recalc] plan from transportId failed:", e);
  }
}
export async function safeRecalcPlanFromScheduleItemId(itemId: string): Promise<void> {
  try {
    const planId = await resolvePlanIdFromScheduleItem(itemId);
    if (planId) await recalcPlanExpenses(planId);
  } catch (e) {
    console.warn("[recalc] plan from itemId failed:", e);
  }
}
