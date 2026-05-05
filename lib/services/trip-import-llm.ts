import "server-only";
import { generateJson } from "./ai-service";
import {
  importTripPayloadSchema,
  type ImportTripPayload,
} from "./trip-import-types";

// Phase 13 — natural-language → ImportTripPayload via internal LLM.
//
// Used by the "自然語言分析" tab when the user prefers to describe a trip in
// plain Chinese instead of pasting structured JSON. We re-use the SAME Zod
// schema the JSON path validates against, so downstream the import pipeline
// is identical.

const SYSTEM_PROMPT = `你是旅遊規劃助理。把使用者的自然語言行程描述轉成結構化 JSON。

【絕對規則】
- 只回 JSON，不要包 \`\`\`json\`\`\`
- 不確定的欄位寧可省略也不要編造
- 時間用 24 小時 "HH:MM"；日期用 "YYYY-MM-DD"
- 經緯度（lat / lng）若你不確定請省略，不要亂編

【欄位 schema】
{
  "schemaVersion": 1,
  "trip": {
    "title": string,
    "destination"?: string,
    "subtitle"?: string,
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "baseCurrency"?: "TWD" | "JPY" | "USD" | "EUR" | "KRW" | "THB" | "HKD" | "SGD" | "CNY" | "GBP" | "MYR" | "VND"
  },
  "days": [
    {
      "date": "YYYY-MM-DD",
      "note"?: string,
      "items": [
        {
          "kind"?: "ATTRACTION" | "MEAL" | "LODGING" | "FREE" | "TRANSPORT_STOP" | "FLIGHT" | "CAR_RENTAL" | "TRAIN",
          "name": string,
          "address"?: string,
          "lat"?: number,
          "lng"?: number,
          "startTime"?: "HH:MM",
          "durationMin"?: number,
          "isAllDay"?: boolean,
          "note"?: string
        }
      ],
      "transports"?: [
        {
          "fromIndex": number,   // 同一天 items 陣列的 0-based 索引
          "toIndex": number,
          "mode"?: "DRIVING" | "WALKING" | "TRANSIT" | "BICYCLING" | "TAXI" | "FLIGHT" | "CUSTOM",
          "durationMin"?: number,
          "distanceM"?: number,
          "fareAmount"?: number,
          "fareCurrency"?: "TWD" | "JPY" | ... ,
          "transitLine"?: string,
          "notes"?: string
        }
      ]
    }
  ]
}

【建議】
- LODGING 項目用 "isAllDay": true 表示整天住宿
- 餐廳建議標 kind: "MEAL"，景點 "ATTRACTION"
- 連續景點之間如果有移動就放一個 transport（mode 預設可給 WALKING）
- days 必須涵蓋 trip.startDate ~ trip.endDate 之間每一天（沒安排的天 items 給 []）
`;

export async function naturalLanguageToImportPayload(
  rawText: string,
): Promise<ImportTripPayload> {
  const result = await generateJson({
    system: SYSTEM_PROMPT,
    prompt: `把下面的自然語言行程描述轉成 JSON：\n\n${rawText.trim()}`,
    schema: importTripPayloadSchema,
    metadata: { feature: "trip-import-nl" },
  });
  return result;
}
