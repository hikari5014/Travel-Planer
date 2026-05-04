import "server-only";
import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";
import { getCurrentUserId } from "@/lib/auth/current-user";
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
  // Phase 11.5 fix — was findFirst() (arbitrary row); now scope to the
  // current user's Settings row — same row /settings page wrote to.
  const userId = await getCurrentUserId();
  const s = await prisma.settings.findUnique({ where: { id: userId } });
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
  } else if (provider.kind === "google") {
    // Google AI Studio (Gemini API). Format is completely different from
    // OpenAI: contents → parts → text, system prompt goes in
    // systemInstruction, JSON mode is responseMimeType.
    // Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    const baseUrl = provider.baseUrl ?? "https://generativelanguage.googleapis.com";
    const url = `${baseUrl}/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": provider.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system + "\n\n只能回應合法 JSON。" }] },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
          temperature: 0.4,
        },
        // Loosen safety filters — travel content occasionally trips defaults
        // (e.g. "藥品" → medical, "酒吧" → adult). All categories set to
        // BLOCK_NONE; Google still blocks anything actually harmful at a
        // higher tier.
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
    }
    const body = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
      promptFeedback?: { blockReason?: string };
    };
    if (body.promptFeedback?.blockReason) {
      throw new Error(`Gemini 拒絕請求：${body.promptFeedback.blockReason}`);
    }
    const cand = body.candidates?.[0];
    if (!cand) throw new Error("Gemini 沒有回傳任何 candidate");
    if (cand.finishReason && cand.finishReason !== "STOP" && cand.finishReason !== "MAX_TOKENS") {
      throw new Error(`Gemini 回應未完成：${cand.finishReason}`);
    }
    raw = cand.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    promptTokens = body.usageMetadata?.promptTokenCount ?? 0;
    completionTokens = body.usageMetadata?.candidatesTokenCount ?? 0;
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
  // Google AI Studio (Gemini) prices — Free tier exists on AI Studio
  // (rate-limited); these are the Vertex AI / paid-tier rates as a
  // conservative upper bound for the cost meter.
  else if (m.includes("gemini-2.5-flash-lite") || m.includes("gemini-2.0-flash-lite")) {
    inRate = 0.0000375; outRate = 0.00015;
  }
  else if (m.includes("gemini-2.5-flash") || m.includes("gemini-2.0-flash") || m.includes("gemini-1.5-flash")) {
    inRate = 0.00015; outRate = 0.0006;
  }
  else if (m.includes("gemini-2.5-pro") || m.includes("gemini-2.0-pro") || m.includes("gemini-1.5-pro")) {
    inRate = 0.00125; outRate = 0.005;
  }
  else if (m.includes("gemini")) {
    inRate = 0.0005; outRate = 0.002;
  }
  return (promptTokens / 1000) * inRate + (completionTokens / 1000) * outRate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check — minimal "echo" call so users can verify a newly-added
// provider key actually works without burning tokens on a real suggestion.
// Returns parsed { ok: true } on success or { ok: false, error } on failure.
// ─────────────────────────────────────────────────────────────────────────────

const HealthSchema = z.object({ ok: z.boolean() });

export async function pingDefaultProvider(): Promise<
  | { ok: true; model: string; providerKind: string; latencyMs: number }
  | { ok: false; error: string }
> {
  const t0 = Date.now();
  try {
    const provider = await resolveDefaultProvider();
    await generateJson({
      system: "Reply with the JSON {\"ok\": true}. Nothing else.",
      prompt: "ping",
      schema: HealthSchema,
      metadata: { kind: "HEALTH_CHECK" },
    });
    return {
      ok: true,
      model: provider.model,
      providerKind: provider.kind,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
      providerId: (await prisma.settings.findUnique({ where: { id: await getCurrentUserId() } }))?.defaultProviderId ?? "",
      model: (await prisma.settings.findUnique({ where: { id: await getCurrentUserId() } }))?.defaultModel ?? "",
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
      providerId: (await prisma.settings.findUnique({ where: { id: await getCurrentUserId() } }))?.defaultProviderId ?? "",
      model: (await prisma.settings.findUnique({ where: { id: await getCurrentUserId() } }))?.defaultModel ?? "",
    },
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport suggestion — given an origin & destination (place names + region),
// ask LLM for an estimated mode/distance/duration/cost + transit line info.
// Used by the TransportEditDialog "AI 自動規劃" button. Coexists with the
// Maps Directions API: Maps gives precise routes, AI gives a knowledgeable
// fallback when no key is configured or for narrative transit details.
// ─────────────────────────────────────────────────────────────────────────────

const TransportSuggestionSchema = z.object({
  mode: z.enum(["DRIVING", "TRANSIT", "WALKING", "BICYCLING", "CUSTOM"]),
  distanceMeters: z.number().int().min(0).max(1_000_000),
  durationSec: z.number().int().min(0).max(60 * 60 * 24),
  estimatedCost: z.number().min(0).max(1_000_000).nullable().optional(),
  transitLine: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type TransportSuggestion = z.infer<typeof TransportSuggestionSchema>;

export async function suggestTransport(input: {
  fromName: string;
  toName: string;
  modeHint?: "DRIVING" | "TRANSIT" | "WALKING" | "BICYCLING" | "CUSTOM";
  region?: string;
}): Promise<TransportSuggestion> {
  const region = input.region?.trim() || "";
  const modeText = input.modeHint
    ? `偏好交通方式：${input.modeHint}（若不合理可改）`
    : "請推薦最合理的交通方式";

  const result = await generateJson({
    system:
      "你是熟悉全球交通路網的旅遊顧問，特別了解台灣（台北捷運、公車、台鐵、高鐵）、" +
      "日本（JR、東京/大阪/京都地鐵、私鐵、新幹線）、韓國（首爾地鐵、KTX）以及主要歐美都會的大眾運輸。" +
      "依使用者提供的起訖點與地區，估算距離（公尺）、時間（秒）、費用（當地常用貨幣，整數）。" +
      "若選擇 TRANSIT，請在 transitLine 提供主要班次/路線（例：『JR 山手線 → 銀座線』、" +
      "『台北捷運紅線（淡水信義線）』），notes 補充轉乘提醒、班距、營運時間。" +
      "若該段距離很短建議 WALKING；無法判斷時用 CUSTOM 並說明。" +
      "費用以該地區常見幣別合理估算（不必換算到 base currency）。" +
      "只能回應符合 schema 的合法 JSON。",
    prompt: `起點：${input.fromName}
終點：${input.toName}
${region ? `地區：${region}\n` : ""}${modeText}

請以 JSON 回應，符合 schema：${JSON.stringify(TransportSuggestionSchema.shape, null, 0)}`,
    schema: TransportSuggestionSchema,
    metadata: { kind: "TRANSPORT_SUGGEST", from: input.fromName, to: input.toName },
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stay-time suggestion (Q1 in plan.md decisions). Default minutes come from
// the heuristic table; user can press "AI 重估" on the floating place card
// to ask the LLM for a more informed estimate based on place name + category
// + region. Result is persisted onto Place.defaultStayMinutes /
// .defaultStaySource = "AI".
// ─────────────────────────────────────────────────────────────────────────────

const StaySuggestionSchema = z.object({
  minutes: z.number().int().min(15).max(8 * 60),
  rationale: z.string().max(500),
});
export type StaySuggestion = z.infer<typeof StaySuggestionSchema>;

export async function suggestStayMinutes(input: {
  name: string;
  category: string;
  address?: string;
  region?: string;
}): Promise<StaySuggestion> {
  const result = await generateJson({
    system:
      "你是熟悉旅遊景點的顧問。給定景點名稱、類別、地區，估算遊客平均應停留多少分鐘。" +
      "範圍 15–480 分鐘。對熱門地標（如清水寺、明洞、大阪城）依其規模給合理時間。" +
      "只回 JSON。",
    prompt: `景點名稱：${input.name}
類別：${input.category}
地址：${input.address ?? "未提供"}
${input.region ? `地區：${input.region}` : ""}

請以 JSON 回應 schema：${JSON.stringify(StaySuggestionSchema.shape, null, 0)}`,
    schema: StaySuggestionSchema,
    metadata: { kind: "STAY_SUGGEST", name: input.name },
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
