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
          "googlePlaceId"?: string,    // ⭐ 強烈建議：Google Places ID（如 "ChIJN1t_..."）
                                        // 提供後系統會自動拉星等 / 照片 / 正確座標
          // 地點層 enrichment（會寫入 Place 表，所有頁面共用；不確定就省略）
          "rating"?: number,           // 1-5 星
          "ratingCount"?: number,
          "summary"?: string,          // 一句話介紹（≤500 字）
          "phone"?: string,            // 連絡電話 — 不確定就省略，避免亂編
          "website"?: string,          // 官網 URL — 不確定就省略
          "priceLevel"?: 1|2|3|4,      // 價位（$ ~ $$$$）
          "tags"?: string[],           // 地點標籤如 ["親子","拍照","雨備"]
          "startTime"?: "HH:MM",
          "durationMin"?: number,
          "isAllDay"?: boolean,
          "note"?: string,
          "metadata"?: { ... }          // 詳見下方「FLIGHT 特殊規則」與其他 kind metadata
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
- **每個 item 都儘量帶 googlePlaceId**：你若知道該地點對應的 Google Places ID，請填上，不知道才省略

【FLIGHT 特殊規則】
- 一個 FLIGHT item 匯入後會被自動拆成「出發機場 + 抵達機場」兩個 ScheduleItem，中間自動建立 FLIGHT 模式 transport — **你不需要也不該再寫對應的 transport**
- FLIGHT item 的 metadata **必須**包含：flightNumber, depAirport (IATA), arrAirport (IATA), depTime, arrTime
- 強烈建議補：airline, terminal/arrTerminal, isInternational, ticketPrice, ticketCurrency, bookingRef, seatNumber
- **強烈建議**補 depGooglePlaceId / arrGooglePlaceId（兩個機場的 Google Places ID）— 這樣兩個機場 item 才會有星等 / 正確座標 / 照片

【kind metadata 速查】
- FLIGHT: flightNumber, airline, depAirport, arrAirport, depTime, arrTime, terminal, arrTerminal, isInternational, checkInBufferMin, immigrationBufferMin, ticketPrice, ticketCurrency, bookingRef, seatNumber, aircraftType, depGooglePlaceId, arrGooglePlaceId
- LODGING: nights, checkOutDate, checkInTime, checkOutTime, guestCount, totalCost, ticketCurrency, bookingPlatform, bookingRef, breakfastIncluded, parkingAvailable, amenities[], roomType
- MEAL: mealPeriod (BREAKFAST/LUNCH/DINNER/LATE_NIGHT), averagePrice, partySize, ticketCurrency, cuisine, mustTry, reservationRef, dietaryOptions[], priceRange
- ATTRACTION: tickets [{ label, unitPrice, quantity }], ticketCurrency, openingHours, highlights, expectedDurationMin, reservationRequired, bestTimeToVisit, accessibility
- CAR_RENTAL: pickupDate, pickupTime, pickupLocation, returnDate, returnTime, returnLocation, vendor, carModel, dailyRate, rentalDays, insurancePerDay, insuranceTier, fuelPolicy, ticketCurrency
- FREE: plan, budget, ticketCurrency, alternativePlan
- 通用: tips（旅行小撇步）, bringList[]（建議攜帶物品）
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
