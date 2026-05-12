import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureCurrentUser, getCurrentUserId } from "@/lib/auth/current-user";
import { money, toCurrency, type CurrencyCode, type CurrencyRates, type Money } from "@/lib/currency";

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas (used by Server Actions / form handlers)
// ─────────────────────────────────────────────────────────────────────────────

// Base object shape (no refinements) — partial() only works on raw objects in Zod 4.
const tripBase = z.object({
  title: z.string().trim().min(1, "請輸入旅程標題").max(80),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "格式錯誤"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "格式錯誤"),
  destination: z.string().max(80).optional().default(""),
  subtitle: z.string().max(120).optional().default(""),
  baseCurrency: z.string().length(3).optional().default("TWD"),
  coverIconKey: z.string().optional().default("landmark"),
  coverColor: z.string().optional().default("from-gray-400 to-gray-600"),
});

export const tripCreateSchema = tripBase.refine(
  (d) => new Date(d.endDate) >= new Date(d.startDate),
  { message: "結束日不能早於開始日", path: ["endDate"] },
);
export type TripCreateInput = z.infer<typeof tripCreateSchema>;

export const tripUpdateSchema = tripBase.partial();
export type TripUpdateInput = z.infer<typeof tripUpdateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

export type TripDashboardSummary = {
  id: string;
  title: string;
  subtitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  coverColor: string;
  coverIconKey: string;
  planCount: number;
  totalCost: number;
  // Phase B2 — Money mirror of totalCost. Same numeric value, tagged with
  // baseCurrency at the type level so callers can pass it straight into
  // <PriceWithLocal value={...} /> without re-asserting the currency.
  totalCostMoney: Money;
  baseCurrency: string;
  // Phase 8 — relationship of current user to this trip.
  role: "owner" | "editor" | "viewer";
  ownerDisplayName: string;
};

export async function listTripsForDashboard(): Promise<TripDashboardSummary[]> {
  const userId = await getCurrentUserId();
  // Phase 14m fix — load current FX rates as a fallback for legacy expense
  // rows whose fxRateToBase was never snapshotted; otherwise the dashboard
  // total cost would render mixed-currency amounts un-normalized.
  const userSettings = await prisma.settings.findUnique({ where: { id: userId }, select: { fxRates: true } });
  const liveFxRates: Record<string, number> = (() => {
    try {
      const r = userSettings?.fxRates ? JSON.parse(userSettings.fxRates) : {};
      return typeof r === "object" && r ? r : {};
    } catch {
      return {};
    }
  })();
  // Trips the user owns OR has an active membership for. Single query via
  // `OR` so we don't make two round-trips.
  const trips = await prisma.trip.findMany({
    where: {
      OR: [
        { userId },
        { members: { some: { userId, removedAt: null } } },
      ],
    },
    orderBy: { startDate: "desc" },
    include: {
      _count: { select: { plans: true } },
      expenses: { select: { amount: true, planId: true, currency: true, fxRateToBase: true } },
      owner: { select: { id: true, displayName: true } },
      members: {
        where: { userId, removedAt: null },
        select: { role: true },
        take: 1,
      },
    },
  });
  return trips.map((t) => {
    const role: "owner" | "editor" | "viewer" =
      t.userId === userId
        ? "owner"
        : ((t.members[0]?.role as "editor" | "viewer") ?? "viewer");
    // Phase B2 — compute once, surface as both legacy number and Money.
    const tripBase = t.baseCurrency as CurrencyCode;
    const tripRatesView: CurrencyRates = {
      base: tripBase,
      rates: liveFxRates as Partial<Record<CurrencyCode, number>>,
      fetchedAt: "",
      source: "settings",
    };
    const totalCostNum = t.expenses
      .filter((e) => !t.defaultPlanId || e.planId === t.defaultPlanId)
      .reduce(
        (sum, e) =>
          sum +
          toCurrency(
            money(e.amount, e.currency as CurrencyCode),
            tripBase,
            tripRatesView,
            e.fxRateToBase,
          ).amount,
        0,
      );
    return {
      id: t.id,
      title: t.title,
      subtitle: t.subtitle ?? "",
      destination: t.destination ?? "",
      startDate: t.startDate.toISOString().slice(0, 10),
      endDate: t.endDate.toISOString().slice(0, 10),
      status: t.status,
      coverColor: t.coverColor,
      coverIconKey: t.coverIconKey,
      planCount: t._count.plans,
      totalCost: totalCostNum,
      totalCostMoney: money(totalCostNum, tripBase),
      baseCurrency: t.baseCurrency,
      role,
      ownerDisplayName: t.owner?.displayName ?? "—",
    };
  });
}

export async function getTripById(id: string) {
  const userId = await getCurrentUserId();
  // Scoping by both id + userId protects against cross-user access via direct
  // URL guessing in multi-user mode. Single-user mode just narrows on userId.
  return prisma.trip.findFirst({
    where: { id, userId },
    include: { plans: { orderBy: { displayOrder: "asc" } } },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

// Create a new Trip with one default Plan and one Day per calendar day in the
// range. Returns the new Trip's id.
export async function createTrip(input: TripCreateInput): Promise<string> {
  // Lazy-create the User row so the trip's owner FK has a valid target
  // (first-time visitors don't have a User row yet — middleware only set
  // the cookie). Subsequent createTrip calls just update lastSeenAt.
  const user = await ensureCurrentUser();
  const userId = user.id;
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data: {
        userId,
        title: input.title,
        startDate: start,
        endDate: end,
        baseCurrency: input.baseCurrency,
        destination: input.destination,
        subtitle: input.subtitle,
        coverColor: input.coverColor,
        coverIconKey: input.coverIconKey,
        status: end < new Date() ? "past" : "active",
      },
    });

    const plan = await tx.plan.create({
      data: {
        tripId: trip.id,
        name: "預設方案",
        displayOrder: 0,
        pace: "標準",
        description: "預設方案 — 自由規劃。",
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
        date: new Date(start.getTime() + i * 86400000),
      })),
    });

    return trip.id;
  });
}

// updateTrip / deleteTrip lock to the owner only. Editors can mutate
// schedule items / transports etc via their own services, but renaming
// or destroying the whole trip stays with the owner.
export async function updateTrip(id: string, input: TripUpdateInput) {
  const userId = await getCurrentUserId();
  const data: Record<string, unknown> = { ...input };
  if (input.startDate) data.startDate = new Date(input.startDate);
  if (input.endDate) data.endDate = new Date(input.endDate);
  // updateMany lets us combine the userId guard. Throws on 0 rows.
  const result = await prisma.trip.updateMany({ where: { id, userId }, data });
  if (result.count === 0) throw new Error("找不到這個旅程或無權編輯");
  return result;
}

export async function deleteTrip(id: string) {
  const userId = await getCurrentUserId();
  const result = await prisma.trip.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw new Error("找不到這個旅程或無權刪除");
  return result;
}
