import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";

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
};

export async function listTripsForDashboard(): Promise<TripDashboardSummary[]> {
  const trips = await prisma.trip.findMany({
    orderBy: { startDate: "desc" },
    include: {
      _count: { select: { plans: true } },
      expenses: { select: { amount: true, planId: true } },
    },
  });
  return trips.map((t) => ({
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
    // Sum expenses across the default plan (or all if no default chosen).
    totalCost: t.expenses
      .filter((e) => !t.defaultPlanId || e.planId === t.defaultPlanId)
      .reduce((sum, e) => sum + e.amount, 0),
  }));
}

export async function getTripById(id: string) {
  return prisma.trip.findUnique({
    where: { id },
    include: { plans: { orderBy: { displayOrder: "asc" } } },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

// Create a new Trip with one default Plan and one Day per calendar day in the
// range. Returns the new Trip's id.
export async function createTrip(input: TripCreateInput): Promise<string> {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data: {
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

export async function updateTrip(id: string, input: TripUpdateInput) {
  const data: Record<string, unknown> = { ...input };
  if (input.startDate) data.startDate = new Date(input.startDate);
  if (input.endDate) data.endDate = new Date(input.endDate);
  return prisma.trip.update({ where: { id }, data });
}

export async function deleteTrip(id: string) {
  return prisma.trip.delete({ where: { id } });
}
