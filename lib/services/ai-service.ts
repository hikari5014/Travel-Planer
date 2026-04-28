import "server-only";
import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";
import { llmProviderSchema } from "@/lib/services/settings-service";
import { logApiUsage } from "./usage-service";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Provider abstraction — Phase 4 keeps it minimal: directly call OpenAI's
// Chat Completions API or Anthropic's Messages API with a JSON-only system
// prompt. Phase 6+ will swap in Vercel AI SDK for streaming + better tool use.
// ─────────────────────────────────────────────────────────────────────────────

type ProviderResolved = {
  id: string;
  kind: "openai" | "anthropic" | "google" | "custom";
  apiKey: string;
  baseUrl?: string;
  model: string;
};

async function resolveDefaultProvider(): Promise<ProviderResolved> {
  const s = await prisma.settings.findFirst();
  if (!s?.defaultProviderId) throw new Error("尚未設定預設 LLM Provider — 請至 /settings");

  const list = JSON.parse(s.llmProviders) as unknown[];
  const raw = list.map((p) => llmProviderSchema.parse(p)).find((p) => p.id === s.defaultProviderId);
  if (!raw) throw new Error("找不到預設 Provider 設定");

  return {
    id: raw.id,
    kind: raw.kind,
    apiKey: decryptString(raw.apiKeyEnc),
    baseUrl: raw.baseUrl,
    model: s.defaultModel || raw.defaultModel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// generateJson — sends `prompt` and gets back a JSON object matching `schema`.
// Logs token usage to ApiUsageLog regardless of provider.
// ─────────────────────────────────────────────────────────────────────────────

export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  metadata?: Record<string, unknown>;
}): Promise<T> {
  const provider = await resolveDefaultProvider();
  const start = Date.now();

  let raw = "";
  let promptTokens = 0;
  let completionTokens = 0;

  if (provider.kind === "anthropic") {
    const res = await fetch((provider.baseUrl ?? "https://api.anthropic.com") + "/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 2048,
        system: opts.system + "\n\n只能回應合法 JSON，不要包 ```。",
        messages: [{ role: "user", content: opts.prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`);
    }
    const body = (await res.json()) as { content: Array<{ text?: string }>; usage?: { input_tokens: number; output_tokens: number } };
    raw = body.content?.[0]?.text ?? "";
    promptTokens = body.usage?.input_tokens ?? 0;
    completionTokens = body.usage?.output_tokens ?? 0;
  } else {
    // OpenAI / OpenAI-compatible
    const res = await fetch((provider.baseUrl ?? "https://api.openai.com") + "/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    }
    const body = (await res.json()) as { choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } };
    raw = body.choices?.[0]?.message?.content ?? "";
    promptTokens = body.usage?.prompt_tokens ?? 0;
    completionTokens = body.usage?.completion_tokens ?? 0;
  }

  // Strip code fences if the model insisted on adding them.
  const trimmed = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("LLM 回傳非 JSON：" + raw.slice(0, 120));
  }

  const validated = opts.schema.parse(parsed);

  await logApiUsage({
    service: "LLM_GENERATE_OBJECT",
    providerId: provider.id,
    model: provider.model,
    promptTokens,
    completionTokens,
    estimatedCostUsd: estimateCost(provider.model, promptTokens, completionTokens),
    metadata: { ...opts.metadata, durationMs: Date.now() - start },
  });

  return validated;
}

// Rough cost map (USD per 1k tokens). Update from official price tables.
function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const m = model.toLowerCase();
  // very approximate — encourage user to check before relying on totals
  let inRate = 0.001, outRate = 0.003;
  if (m.includes("gpt-4o-mini")) { inRate = 0.00015; outRate = 0.0006; }
  else if (m.includes("gpt-4o")) { inRate = 0.0025; outRate = 0.01; }
  else if (m.includes("haiku")) { inRate = 0.00025; outRate = 0.00125; }
  else if (m.includes("sonnet")) { inRate = 0.003; outRate = 0.015; }
  else if (m.includes("opus")) { inRate = 0.015; outRate = 0.075; }
  return (promptTokens / 1000) * inRate + (completionTokens / 1000) * outRate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion schemas (中英對照)
// ─────────────────────────────────────────────────────────────────────────────

const ZhEnPair = z.object({ zh: z.string(), en: z.string().optional() });

const PreTripNotesSchema = z.object({
  weatherSummary: z.string(),
  currencyTip: z.string(),
  plugType: ZhEnPair,
  languageTip: z.string(),
  healthAdvice: z.array(z.string()),
  documents: z.array(ZhEnPair),
  medications: z.array(ZhEnPair.extend({ note: z.string().optional() })),
  localCustoms: z.array(z.string()),
  emergencyContacts: z.array(z.object({ label_zh: z.string(), label_en: z.string().optional(), number: z.string() })),
});
export type PreTripNotes = z.infer<typeof PreTripNotesSchema>;

const PackingChecklistSchema = z.object({
  categories: z.array(z.object({
    name_zh: z.string(),
    items: z.array(ZhEnPair.extend({ essential: z.boolean().optional(), note: z.string().optional() })),
  })),
});
export type PackingChecklist = z.infer<typeof PackingChecklistSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion entry points
// ─────────────────────────────────────────────────────────────────────────────

async function buildPlanContext(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      trip: true,
      days: {
        orderBy: { dayIndex: "asc" },
        include: { scheduleItems: { include: { place: true } } },
      },
    },
  });
  if (!plan) throw new Error("找不到 Plan");

  const destinations = new Set<string>();
  const placeNames: string[] = [];
  for (const d of plan.days) {
    for (const it of d.scheduleItems) {
      if (it.place) {
        placeNames.push(it.place.name);
        if (it.place.address) destinations.add(it.place.address.split(/[市區]/)[0]);
      }
    }
  }
  return {
    title: plan.trip.title,
    startDate: plan.trip.startDate.toISOString().slice(0, 10),
    endDate: plan.trip.endDate.toISOString().slice(0, 10),
    destination: plan.trip.destination,
    pace: plan.pace,
    dayCount: plan.days.length,
    places: placeNames.slice(0, 30),
    season: monthToSeason(plan.trip.startDate),
  };
}

function monthToSeason(d: Date): string {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return "春";
  if (m >= 6 && m <= 8) return "夏";
  if (m >= 9 && m <= 11) return "秋";
  return "冬";
}

export async function suggestPreTripNotes(planId: string): Promise<PreTripNotes> {
  const ctx = await buildPlanContext(planId);
  const result = await generateJson({
    system: "你是專業旅遊顧問。針對旅程目的地與季節，產生繁中為主的行前注意事項。重要欄位（插頭、文件、藥品、緊急聯絡）需提供中英對照。",
    prompt: `行程：${ctx.title}\n目的地：${ctx.destination}\n日期：${ctx.startDate} ~ ${ctx.endDate}（${ctx.season}）\n節奏：${ctx.pace}\n景點樣本：${ctx.places.join("、")}\n\n請以 JSON 格式回應，符合此 schema：${JSON.stringify(PreTripNotesSchema.shape, null, 0)}`,
    schema: PreTripNotesSchema,
    metadata: { planId, kind: "PRE_TRIP_NOTES" },
  });

  await prisma.aISuggestion.create({
    data: {
      planId,
      kind: "PRE_TRIP_NOTES",
      input: JSON.stringify(ctx),
      output: JSON.stringify(result),
      providerId: (await prisma.settings.findFirst())?.defaultProviderId ?? "",
      model: (await prisma.settings.findFirst())?.defaultModel ?? "",
    },
  });

  return result;
}

export async function suggestPackingChecklist(planId: string): Promise<PackingChecklist> {
  const ctx = await buildPlanContext(planId);
  const result = await generateJson({
    system: "你是專業旅遊顧問。依目的地、季節、行程內容產生分類的行李 checklist。物品名稱需中英對照，必備項目請標 essential=true。",
    prompt: `行程：${ctx.title}（${ctx.destination}）\n日期：${ctx.startDate} ~ ${ctx.endDate}（${ctx.season}）\n${ctx.dayCount} 天 / ${ctx.pace}節奏\n景點：${ctx.places.slice(0, 10).join("、")}\n\n請以 JSON 格式回應：${JSON.stringify(PackingChecklistSchema.shape, null, 0)}`,
    schema: PackingChecklistSchema,
    metadata: { planId, kind: "PACKING_CHECKLIST" },
  });

  await prisma.aISuggestion.create({
    data: {
      planId,
      kind: "PACKING_CHECKLIST",
      input: JSON.stringify(ctx),
      output: JSON.stringify(result),
      providerId: (await prisma.settings.findFirst())?.defaultProviderId ?? "",
      model: (await prisma.settings.findFirst())?.defaultModel ?? "",
    },
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cached suggestion lookup (so the AI page can show last result without
// re-spending tokens).
// ─────────────────────────────────────────────────────────────────────────────

export async function getLatestSuggestions(planId: string) {
  const rows = await prisma.aISuggestion.findMany({
    where: { planId },
    orderBy: { generatedAt: "desc" },
  });
  let preTripNotes: PreTripNotes | null = null;
  let packing: PackingChecklist | null = null;
  for (const r of rows) {
    try {
      if (r.kind === "PRE_TRIP_NOTES" && !preTripNotes) preTripNotes = JSON.parse(r.output);
      if (r.kind === "PACKING_CHECKLIST" && !packing) packing = JSON.parse(r.output);
    } catch { /* ignore */ }
  }
  return {
    preTripNotes,
    packingChecklist: packing,
    history: rows.map((r) => ({
      id: r.id, kind: r.kind, generatedAt: r.generatedAt.toISOString(), providerId: r.providerId, model: r.model,
    })),
  };
}
