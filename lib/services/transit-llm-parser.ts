import "server-only";
import { z } from "zod";
import { generateJson } from "./ai-service";
import type { ParsedTransit, ParsedCurrency } from "./transit-rule-parser";

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
});

const SYSTEM_PROMPT = `你是大眾運輸時刻表解析器。從使用者貼上的 Google Maps 文字中擷取以下欄位：
- durationMinutes：總分鐘數（整數），無法判斷則 null
- fareAmount：票價金額，無法判斷則 null。若有多個（IC / 現金）取最低
- fareCurrency：JPY / TWD / USD / EUR / GBP / KRW / CNY / HKD 之一，或 null
- routeName：路線名稱（如「JR 山手線」「Tokyo Metro 銀座線」），多段轉乘用「 → 」連接
- departureTime / arrivalTime：24 小時制 "HH:MM" 字串
- transferCount：轉乘次數整數，無資訊則 null
- notes：補充資訊（月台、班次、特殊情況），無則 null

文字可能是中、英、日任一語言混雜。**不要猜測沒寫的資料 — 沒看到就回 null**。`;

export async function parseTransitWithLlm(rawText: string): Promise<ParsedTransit> {
  const llmResult = await generateJson({
    system: SYSTEM_PROMPT,
    prompt: `請解析下列 Google Maps 路線文字：\n\n${rawText}`,
    schema: llmTransitSchema,
    metadata: { feature: "transit-paste-parse" },
  });

  return {
    durationMinutes: llmResult.durationMinutes,
    fareAmount: llmResult.fareAmount,
    fareCurrency: llmResult.fareCurrency as ParsedCurrency | null,
    routeName: llmResult.routeName,
    departureTime: llmResult.departureTime,
    arrivalTime: llmResult.arrivalTime,
    transferCount: llmResult.transferCount,
    notes: llmResult.notes,
    _confidence: {
      duration: llmResult.durationMinutes !== null ? 0.95 : 0,
      fare: llmResult.fareAmount !== null ? 0.95 : 0,
      routeName: llmResult.routeName !== null ? 0.95 : 0,
      times:
        llmResult.departureTime !== null && llmResult.arrivalTime !== null ? 0.95 : 0,
    },
  };
}
