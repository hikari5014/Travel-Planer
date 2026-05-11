import "server-only";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth/current-user";

export type ApiService =
  | "GOOGLE_PLACES_AUTOCOMPLETE"
  | "GOOGLE_PLACES_DETAILS"
  | "GOOGLE_PLACES_PHOTO"
  | "GOOGLE_PLACES_NEARBY"
  | "GOOGLE_DIRECTIONS"
  | "GOOGLE_STATIC_MAPS"
  | "LLM_CHAT"
  | "LLM_GENERATE_OBJECT"
  // Phase 12 — flight lookup tiers (so users see exact call counts in /settings)
  | "AVIATIONSTACK_FLIGHT_LOOKUP"
  | "AERODATABOX_FLIGHT_LOOKUP";

export async function logApiUsage(input: {
  service: ApiService;
  providerId?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  metadata?: Record<string, unknown>;
}) {
  const userId = await getCurrentUserId();
  return prisma.apiUsageLog.create({
    data: {
      userId,
      service: input.service,
      providerId: input.providerId ?? null,
      model: input.model ?? null,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      estimatedCostUsd: input.estimatedCostUsd ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

export type UsageSummary = {
  monthRange: { start: string; end: string };
  totalCalls: number;
  totalCostUsd: number;
  byService: Array<{ service: string; calls: number; tokens: number; costUsd: number }>;
  byProvider: Array<{ providerId: string; model: string; calls: number; tokens: number; costUsd: number }>;
};

export async function getMonthlyUsage(): Promise<UsageSummary> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const userId = await getCurrentUserId();
  const rows = await prisma.apiUsageLog.findMany({
    where: { userId, occurredAt: { gte: start, lt: end } },
  });

  const byService = new Map<string, { calls: number; tokens: number; costUsd: number }>();
  const byProvider = new Map<string, { providerId: string; model: string; calls: number; tokens: number; costUsd: number }>();
  let totalCost = 0;

  for (const r of rows) {
    const tokens = (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
    const cost = r.estimatedCostUsd ?? 0;
    totalCost += cost;
    const sv = byService.get(r.service) ?? { calls: 0, tokens: 0, costUsd: 0 };
    sv.calls += 1; sv.tokens += tokens; sv.costUsd += cost;
    byService.set(r.service, sv);

    if (r.providerId) {
      const key = `${r.providerId}|${r.model ?? ""}`;
      const pv = byProvider.get(key) ?? { providerId: r.providerId, model: r.model ?? "", calls: 0, tokens: 0, costUsd: 0 };
      pv.calls += 1; pv.tokens += tokens; pv.costUsd += cost;
      byProvider.set(key, pv);
    }
  }

  return {
    monthRange: { start: start.toISOString(), end: end.toISOString() },
    totalCalls: rows.length,
    totalCostUsd: Math.round(totalCost * 10000) / 10000,
    byService: [...byService.entries()].map(([service, v]) => ({ service, ...v })),
    byProvider: [...byProvider.values()],
  };
}
