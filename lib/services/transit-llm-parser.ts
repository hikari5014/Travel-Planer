import "server-only";
import { z } from "zod";
import { generateJson } from "./ai-service";
import type { ParsedTransit, ParsedCurrency } from "./transit-rule-parser";
import type { TransitSteps } from "./transit-steps-types";

// Phase 12b — extend the LLM response shape with optional `steps` and
// `serviceFrequencyMin`. Primary fields stay required-or-null so the existing
// flat-fields apply flow keeps working. Steps validation is wrapped in its
// own try/catch — if Zod rejects the steps array (LLM returned malformed
// shape) we still apply the flat fields.

const llmWalkStep = z.object({
  kind: z.literal("walk"),
  durationSec: z.number().int().nonnegative(),
  distanceM: z.number().int().nonnegative(),
  instruction: z.string().max(200).optional(),
});

const llmRideStep = z.object({
  kind: z.literal("ride"),
  lineName: z.string().min(1).max(80),
  lineCode: z.string().max(8).optional(),
  lineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  lineTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  vehicleType: z
    .enum(["SUBWAY", "HEAVY_RAIL", "COMMUTER_TRAIN", "BUS", "TRAM", "FERRY"])
    .optional(),
  serviceType: z.string().max(20).optional(),
  fromStation: z.string().min(1).max(60),
  toStation: z.string().min(1).max(60),
  fromStationId: z.string().max(8).optional(),
  toStationId: z.string().max(8).optional(),
  numStops: z.number().int().nonnegative(),
  durationSec: z.number().int().nonnegative(),
  platform: z.string().max(20).optional(),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/),
  headsign: z.string().max(40).optional(),
});

const llmTransitSchema = z.object({
  durationMinutes: z.number().int().positive().nullable(),
  fareAmount: z.number().nonnegative().nullable(),
  fareCurrency: z
    .enum(["JPY", "TWD", "USD", "EUR", "GBP", "KRW", "CNY", "HKD"])
    .nullable(),
  routeName: z.string().max(200).nullable(),
  departureTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  arrivalTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  transferCount: z.number().int().min(0).nullable(),
  notes: z.string().max(500).nullable(),
  // Phase 12b — rich step timeline (optional; LLM may skip when it can't extract)
  steps: z.array(z.union([llmWalkStep, llmRideStep])).max(20).nullable().optional(),
  serviceFrequencyMin: z.number().int().positive().max(120).nullable().optional(),
});

const SYSTEM_PROMPT = `你是大眾運輸時刻表解析器。從使用者貼上的 Google Maps 文字中擷取以下欄位：

【必填欄位】
- durationMinutes：總分鐘數（整數），無法判斷則 null
- fareAmount：票價金額，無法判斷則 null。若有多個（IC / 現金）取最低
- fareCurrency：JPY / TWD / USD / EUR / GBP / KRW / CNY / HKD 之一，或 null
- routeName：路線名稱（如「JR 山手線」「Tokyo Metro 銀座線」），多段轉乘用「 → 」連接
- departureTime / arrivalTime：24 小時制 "HH:MM" 字串
- transferCount：轉乘次數整數，無資訊則 null
- notes：補充資訊（月台、班次、特殊情況），無則 null

【選填欄位 — 詳細步驟（若文字含逐站行程才輸出）】
若文字包含完整的逐站行程（如「12:30 淺草寺 → 步行 3 分 → 12:33 淺草站 → 銀座線 各站停車 → 12:43 神田 → 步行 3 分 → 12:48 神田 → 中央線 12 分 → 13:00 新宿」），請額外輸出 steps 陣列，依序排列：

- 步行段：{ kind: "walk", durationSec, distanceM, instruction? }
  - 沒寫公尺時用每分鐘 80 公尺估算
- 搭乘段：{ kind: "ride", lineName, lineCode?, lineColor? (hex #RRGGBB),
  serviceType?, fromStation, toStation, fromStationId? (例如 G19),
  toStationId?, numStops, durationSec, platform?, departureTime, arrivalTime,
  headsign?, vehicleType? }
  - lineCode：路線代號（銀座線→"G"、中央線快速→"JC"、Tokyo Metro→英文字母）
  - serviceType：各站停車 / 快速 / 特急 / 急行 / 普通
  - vehicleType：SUBWAY（地鐵）/ HEAVY_RAIL（火車）/ COMMUTER_TRAIN（通勤）/ BUS / TRAM / FERRY

若有「每 4 分鐘」「every 4 min」班距，輸出 serviceFrequencyMin: 4。

【嚴格規則】
- 任何欄位不確定時請省略（optional 欄位）或回 null（必填欄位），**絕對不要編造**
- 整段缺乏逐站資料時 steps 留 null（不要硬切）
- 文字可能是中、英、日任一語言混雜`;

type LlmTransitResult = {
  durationMinutes: number | null;
  fareAmount: number | null;
  fareCurrency: ParsedCurrency | null;
  routeName: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  transferCount: number | null;
  notes: string | null;
};

export async function parseTransitWithLlm(
  rawText: string,
): Promise<{ flat: ParsedTransit; steps: TransitSteps | null }> {
  const llmResult = await generateJson({
    system: SYSTEM_PROMPT,
    prompt: `請解析下列 Google Maps 路線文字：\n\n${rawText}`,
    schema: llmTransitSchema,
    metadata: { feature: "transit-paste-parse" },
  });

  const flat: ParsedTransit = buildFlatResult(llmResult);

  // Steps assembly — wrapped so a malformed steps array doesn't kill the
  // flat fields (which is the path the rest of the app already handles).
  let steps: TransitSteps | null = null;
  try {
    if (llmResult.steps && llmResult.steps.length > 0) {
      steps = {
        steps: llmResult.steps,
        ...(llmResult.fareCurrency ? { totalFareCurrency: llmResult.fareCurrency } : {}),
        ...(llmResult.serviceFrequencyMin
          ? { serviceFrequencyMin: llmResult.serviceFrequencyMin }
          : {}),
        schemaVersion: 1,
      };
    }
  } catch {
    steps = null;
  }

  return { flat, steps };
}

function buildFlatResult(r: z.infer<typeof llmTransitSchema>): ParsedTransit {
  const flat: LlmTransitResult = {
    durationMinutes: r.durationMinutes,
    fareAmount: r.fareAmount,
    fareCurrency: r.fareCurrency as ParsedCurrency | null,
    routeName: r.routeName,
    departureTime: r.departureTime,
    arrivalTime: r.arrivalTime,
    transferCount: r.transferCount,
    notes: r.notes,
  };
  return {
    ...flat,
    _confidence: {
      duration: flat.durationMinutes !== null ? 0.95 : 0,
      fare: flat.fareAmount !== null ? 0.95 : 0,
      routeName: flat.routeName !== null ? 0.95 : 0,
      times:
        flat.departureTime !== null && flat.arrivalTime !== null ? 0.95 : 0,
    },
  };
}
