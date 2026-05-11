// Phase 13 — External trip import.
//
// Two paths converge to the same Zod-validated shape:
//   1. JSON pasted from an external LLM (Gemini Web / ChatGPT / Claude.ai etc)
//   2. Natural-language pasted into the dialog → internal LLM produces the same JSON
//
// Schema is intentionally lean: only fields an external LLM can reliably fill.
// Missing fields fall back to sensible defaults during import (no lat/lng →
// custom place without coords; no transport → free segment; no startTime →
// continue-after-previous via cascade engine).

import { z } from "zod";

const HHMM = z.string().regex(/^\d{2}:\d{2}$/, "時間請用 HH:MM 24h 格式");
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期請用 YYYY-MM-DD 格式");

const SCHEDULE_KIND = z.enum([
  "ATTRACTION",
  "MEAL",
  "LODGING",
  "FREE",
  "TRANSPORT_STOP",
  "FLIGHT",
  "CAR_RENTAL",
  "TRAIN",
]);

const TRANSPORT_MODE = z.enum([
  "DRIVING",
  "WALKING",
  "TRANSIT",
  "BICYCLING",
  "TAXI",
  "FLIGHT",
  "CUSTOM",
]);

// Phase 14h — kind-specific metadata accepted alongside basic place info.
// External LLM is encouraged to fill whichever fields it knows for the kind;
// import service routes them to the corresponding metadata schema.
const importItemMetaSchema = z
  .object({
    // FLIGHT
    flightNumber: z.string().optional(),
    airline: z.string().optional(),
    depAirport: z.string().optional(),
    arrAirport: z.string().optional(),
    depTime: HHMM.optional(),
    arrTime: HHMM.optional(),
    arrDateOffset: z.number().int().min(0).max(2).optional(),
    terminal: z.string().optional(),
    arrTerminal: z.string().optional(),
    isInternational: z.boolean().optional(),
    checkInBufferMin: z.number().int().min(0).max(600).optional(),
    immigrationBufferMin: z.number().int().min(0).max(600).optional(),
    seatNumber: z.string().optional(),
    aircraftType: z.string().optional(),
    baggageAllowance: z.string().optional(),
    mealNote: z.string().optional(),
    // Phase 14i — Google Places id per airport (preferred over IATA fallback
    // when supplied; populates the airport item with rating / lat-lng / photo)
    depGooglePlaceId: z.string().optional(),
    arrGooglePlaceId: z.string().optional(),
    // LODGING
    checkInTime: HHMM.optional(),
    checkOutTime: HHMM.optional(),
    checkOutDate: ISO_DATE.optional(),
    nights: z.number().int().min(1).max(120).optional(),
    guestCount: z.number().int().min(1).max(20).optional(),
    bookingPlatform: z.string().optional(),
    breakfastIncluded: z.boolean().optional(),
    parkingAvailable: z.boolean().optional(),
    parkingFeePerNight: z.number().nonnegative().optional(),
    wifiPassword: z.string().optional(),
    cancellationPolicy: z.string().optional(),
    // MEAL
    mealPeriod: z.enum(["BREAKFAST", "LUNCH", "DINNER", "LATE_NIGHT"]).optional(),
    reservationTime: HHMM.optional(),
    reservationRef: z.string().optional(),
    reservationPlatform: z.string().optional(),
    averagePrice: z.number().nonnegative().optional(),
    partySize: z.number().int().min(1).max(50).optional(),
    cuisine: z.string().optional(),
    mustTry: z.string().optional(),
    specialRequests: z.string().optional(),
    // ATTRACTION
    expectedDurationMin: z.number().int().min(0).max(720).optional(),
    reservationRequired: z.boolean().optional(),
    tickets: z
      .array(
        z.object({
          label: z.string(),
          unitPrice: z.number().nonnegative(),
          quantity: z.number().int().min(0).default(1),
        }),
      )
      .optional(),
    openingHours: z.string().optional(),
    highlights: z.string().optional(),
    // Phase 14m — additional ATTRACTION metadata
    bestTimeToVisit: z.string().max(120).optional(),
    accessibility: z.string().max(300).optional(),
    // CAR_RENTAL
    pickupDate: ISO_DATE.optional(),
    pickupTime: HHMM.optional(),
    pickupLocation: z.string().optional(),
    returnDate: ISO_DATE.optional(),
    returnTime: HHMM.optional(),
    returnLocation: z.string().optional(),
    vendor: z.string().optional(),
    carModel: z.string().optional(),
    dailyRate: z.number().nonnegative().optional(),
    rentalDays: z.number().int().min(1).max(120).optional(),
    insuranceTier: z.enum(["BASIC", "PREMIUM", "FULL", "NONE"]).optional(),
    insurancePerDay: z.number().nonnegative().optional(),
    fuelPolicy: z.enum(["FULL_TO_FULL", "FULL_TO_EMPTY", "PRE_PURCHASED", "OTHER"]).optional(),
    addOns: z.string().optional(),
    addOnTotal: z.number().nonnegative().optional(),
    driverLicense: z.string().optional(),
    // FREE
    plan: z.string().optional(),
    budget: z.number().nonnegative().optional(),
    alternativePlan: z.string().optional(),
    // TRANSPORT_STOP
    purpose: z.string().optional(),
    // Common: price + currency for kind-derived expenses
    ticketPrice: z.number().nonnegative().optional(),
    ticketCurrency: z.string().length(3).optional(),
    totalCost: z.number().nonnegative().optional(),
    bookingRef: z.string().optional(),
    // Phase 14m — additional kind-specific metadata
    // MEAL
    dietaryOptions: z.array(z.string().max(40)).max(20).optional(),
    priceRange: z.string().max(40).optional(),
    // LODGING
    amenities: z.array(z.string().max(40)).max(30).optional(),
    roomType: z.string().max(80).optional(),
    // common item-level
    tips: z.string().max(500).optional(),
    bringList: z.array(z.string().max(60)).max(20).optional(),
  })
  .partial();
export type ImportItemMeta = z.infer<typeof importItemMetaSchema>;

export const importItemSchema = z.object({
  kind: SCHEDULE_KIND.optional().default("ATTRACTION"),
  name: z.string().min(1).max(120),
  address: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  // Phase 14i — Google Places id (e.g. "ChIJN1t_..."). When provided, import
  // service fetches details and creates a Google-backed Place row instead of
  // a local-* custom Place — so rating / photos / map pin all work.
  googlePlaceId: z.string().min(1).max(200).optional(),
  // Phase 14m — place-level enrichment. Persisted into the Place table so
  // every UI surface (list rows / FloatingPlaceCard / PDF / handbook) reads
  // them uniformly. All optional; omit if unsure (avoid hallucination).
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().min(0).optional(),
  summary: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  website: z.string().max(500).optional(),
  priceLevel: z.number().int().min(1).max(4).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  startTime: HHMM.optional(),
  durationMin: z.number().int().min(0).max(24 * 60).optional(),
  isAllDay: z.boolean().optional().default(false),
  note: z.string().max(2000).optional(),
  // Phase 14h — kind-specific metadata
  metadata: importItemMetaSchema.optional(),
});

export const importTransportSchema = z.object({
  fromIndex: z.number().int().min(0),
  toIndex: z.number().int().min(0),
  mode: TRANSPORT_MODE.optional().default("WALKING"),
  durationMin: z.number().int().min(0).max(48 * 60).optional(),
  distanceM: z.number().int().min(0).max(20_000_000).optional(),
  fareAmount: z.number().nonnegative().optional(),
  fareCurrency: z.string().length(3).optional(),
  transitLine: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export const importDaySchema = z.object({
  date: ISO_DATE,
  note: z.string().max(500).optional(),
  items: z.array(importItemSchema).min(0).max(50),
  transports: z.array(importTransportSchema).max(50).optional().default([]),
});

export const importTripPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  trip: z.object({
    title: z.string().min(1).max(120),
    destination: z.string().max(120).optional(),
    subtitle: z.string().max(200).optional(),
    startDate: ISO_DATE,
    endDate: ISO_DATE,
    baseCurrency: z.string().length(3).optional().default("TWD"),
  }),
  days: z.array(importDaySchema).min(1).max(60),
});

export type ImportTripPayload = z.infer<typeof importTripPayloadSchema>;
export type ImportItem = z.infer<typeof importItemSchema>;
export type ImportTransport = z.infer<typeof importTransportSchema>;
export type ImportDay = z.infer<typeof importDaySchema>;

// ─── Schema doc — copied to clipboard from the dialog so users can paste it
// into their external LLM session. Kept as a single TS const so it's the
// SAME source the Zod schema enforces.
export const TRIP_IMPORT_SCHEMA_DOC = `# 旅遊規劃 Z — 行程匯入 JSON 格式（Phase 15）

請依照以下 JSON 格式輸出我的旅遊行程，**把完整 JSON 包在 \`\`\`json … \`\`\` 程式碼區塊內**回給我（這樣我可以直接點對話框右上角的「複製」按鈕，不用手動選取）。

每個行程項目（item）都可以根據 \`kind\` 提供額外的 \`metadata\` 欄位，欄位類型不限定，按你知道的填，不知道的省略。

## 範例

\`\`\`json
{
  "schemaVersion": 1,
  "trip": {
    "title": "東京 5 日春櫻",
    "destination": "Tokyo",
    "subtitle": "賞櫻 + 美食",
    "startDate": "2026-04-01",
    "endDate": "2026-04-05",
    "baseCurrency": "TWD"
  },
  "days": [
    {
      "date": "2026-04-01",
      "note": "Day 1 — 抵達 + 淺草",
      "items": [
        {
          "kind": "ATTRACTION",
          "name": "淺草寺",
          "address": "東京都台東區淺草 2-3-1",
          "lat": 35.7148,
          "lng": 139.7967,
          "googlePlaceId": "ChIJ8T1GpMGOGGARDYGSgpooDWw",
          "startTime": "14:00",
          "durationMin": 90,
          "note": "雷門進、寶藏門出",
          "metadata": {
            "tickets": [
              { "label": "成人", "unitPrice": 0, "quantity": 2 }
            ],
            "ticketCurrency": "JPY",
            "openingHours": "全天開放",
            "highlights": "雷門大燈籠拍照\\n仲見世通逛街"
          }
        },
        {
          "kind": "MEAL",
          "name": "築地壽司大",
          "startTime": "18:30",
          "durationMin": 60,
          "metadata": {
            "mealPeriod": "DINNER",
            "averagePrice": 4500,
            "partySize": 2,
            "ticketCurrency": "JPY",
            "cuisine": "壽司",
            "mustTry": "おまかせ\\n中とろ"
          }
        },
        {
          "kind": "FLIGHT",
          "name": "JL5042 TSA → HND",
          "startTime": "13:00",
          "metadata": {
            "flightNumber": "JL5042",
            "airline": "Japan Airlines",
            "depAirport": "TSA",
            "arrAirport": "HND",
            "depTime": "13:00",
            "arrTime": "17:10",
            "isInternational": true,
            "checkInBufferMin": 120,
            "immigrationBufferMin": 60,
            "ticketPrice": 31000,
            "ticketCurrency": "TWD",
            "bookingRef": "ABC123",
            "seatNumber": "12A",
            "terminal": "1",
            "depGooglePlaceId": "ChIJB7OlT_2pQjQR0Yh6cZwLeF8",
            "arrGooglePlaceId": "ChIJVdvoSc6lGGARQI-UcYrhQAQ"
          }
        },
        {
          "kind": "LODGING",
          "name": "東橫 INN 淺草",
          "isAllDay": true,
          "metadata": {
            "nights": 4,
            "checkOutDate": "2026-04-05",
            "checkInTime": "15:00",
            "checkOutTime": "11:00",
            "guestCount": 2,
            "totalCost": 28000,
            "ticketCurrency": "JPY",
            "bookingPlatform": "Booking",
            "bookingRef": "BK1234567",
            "breakfastIncluded": true,
            "parkingAvailable": true,
            "wifiPassword": "hotel2026"
          }
        }
      ],
      "transports": [
        {
          "fromIndex": 0,
          "toIndex": 1,
          "mode": "TRANSIT",
          "durationMin": 25,
          "fareAmount": 210,
          "fareCurrency": "JPY",
          "transitLine": "銀座線"
        }
      ]
    }
  ]
}
\`\`\`

## 欄位說明

### \`trip\`（必填）
- \`title\`：行程名稱
- \`destination\`：目的地名稱（國家或城市）
- \`subtitle\`：副標題（可省略）
- \`startDate\` / \`endDate\`：YYYY-MM-DD
- \`baseCurrency\`：3 碼 ISO 4217（TWD / JPY / USD / EUR / KRW / THB / HKD / SGD / CNY / GBP / MYR / VND）

### \`days[]\`
- \`date\`：YYYY-MM-DD，必須在 trip 範圍內
- \`items[]\`：當天景點清單，依時間順序
- \`transports[]\`：景點之間的移動段，**用 fromIndex/toIndex 指向同一天 items 陣列的 0-based 索引**

### \`days[].items[]\`
- \`kind\`（可省略，預設 ATTRACTION）：
  - \`ATTRACTION\`：景點
  - \`MEAL\`：餐廳
  - \`LODGING\`：住宿（建議搭配 \`isAllDay: true\`）
  - \`FREE\`：自由時間
  - \`TRANSPORT_STOP\`：中繼站（如轉機機場）
  - \`FLIGHT\`：飛航段
  - \`CAR_RENTAL\`：租車
  - \`TRAIN\`：火車
- \`name\`（必填）：地名
- \`address\`：地址（不確定可省略）
- \`lat\` / \`lng\`：經緯度（不確定可省略，匯入後地圖上不會顯示 pin）
- \`googlePlaceId\`：Google Places ID（如 \`ChIJN1t_...\`）— **強烈建議填寫**。提供後系統會自動拉星等 / 照片 / 正確座標，地點卡片才會顯示星星 ⭐。不確定可省略
- 地點層 enrichment（**會寫入 Place 表，所有頁面共用**；不確定就省略避免亂編）：
  - \`rating\`：1-5 星評分
  - \`ratingCount\`：評分人數
  - \`summary\`：一句話介紹
  - \`phone\`：連絡電話
  - \`website\`：官網 URL
  - \`priceLevel\`：1-4（\\$ ~ \\$\\$\\$\\$）
  - \`tags\`：標籤陣列，如 \`["親子","拍照","雨備"]\`
- \`startTime\`：HH:MM 24 小時制（不填則自動接續前一個項目）
- \`durationMin\`：滯留分鐘數（不填則用該類型預設值）
- \`isAllDay\`：true 時佔整天（適用 LODGING）
- \`note\`：自由文字備註
- \`metadata\`：類型專屬詳情（強烈建議填寫，會自動帶入費用 / PDF / 列表摘要）

### \`metadata\` 各 kind 可用欄位

**FLIGHT**（特殊：每個 FLIGHT item 匯入後會自動拆成「出發機場 + 抵達機場」兩個 ScheduleItem，中間自動建立 FLIGHT 模式 transport — 不需要自己再寫 transport）
- \`flightNumber\`, \`airline\`, \`depAirport\`, \`arrAirport\`, \`depTime\`, \`arrTime\`
- \`arrDateOffset\`：跨日抵達（+0/+1/+2）
- \`terminal\`, \`arrTerminal\`, \`seatNumber\`, \`bookingRef\` (PNR)
- \`isInternational\`：國際航班（影響 buffer 預設）
- \`checkInBufferMin\`, \`immigrationBufferMin\`：分鐘（顯示在卡片內，不另建 item）
- \`ticketPrice\` + \`ticketCurrency\`：機票（自動建立 FLIGHT 類別 expense）
- \`aircraftType\`, \`baggageAllowance\`, \`mealNote\`
- \`depGooglePlaceId\` / \`arrGooglePlaceId\`：**強烈建議**，這樣兩個機場 item 才有星星 / 照片 / 正確座標

**LODGING**
- \`nights\`：總晚數；\`checkOutDate\`：退房日期
- \`checkInTime\`, \`checkOutTime\`：HH:MM
- \`guestCount\`：入住人數
- \`totalCost\` + \`ticketCurrency\`：訂房總額（自動 LODGING expense）
- \`bookingPlatform\`, \`bookingRef\`
- \`breakfastIncluded\`, \`parkingAvailable\`, \`parkingFeePerNight\`
- \`wifiPassword\`, \`cancellationPolicy\`
- \`amenities\`：陣列如 \`["pool","gym","spa"]\`
- \`roomType\`：例「雙人雙床和洋室」

**MEAL**
- \`mealPeriod\`：BREAKFAST / LUNCH / DINNER / LATE_NIGHT
- \`reservationTime\`, \`reservationRef\`, \`reservationPlatform\`
- \`averagePrice\` + \`partySize\` + \`ticketCurrency\`：人均 × 人數 → 自動 FOOD expense
- \`cuisine\`, \`mustTry\`（多行 \\n 分隔）, \`specialRequests\`
- \`dietaryOptions\`：陣列如 \`["vegan","vegetarian","halal","gluten-free"]\`
- \`priceRange\`：例「\\$\\$」「NT\\$ 300-500/人」

**ATTRACTION**
- \`tickets\`：多種票價陣列 \`[{ label, unitPrice, quantity }]\`（自動 TICKET expense）
- \`ticketCurrency\`
- \`reservationRequired\`, \`bookingRef\`
- \`expectedDurationMin\`, \`openingHours\`, \`highlights\`
- \`bestTimeToVisit\`：最佳造訪時段
- \`accessibility\`：無障礙說明

**CAR_RENTAL**
- \`pickupDate\`, \`pickupTime\`, \`pickupLocation\`, \`returnDate\`, \`returnTime\`, \`returnLocation\`
- \`vendor\`, \`carModel\`, \`bookingRef\`
- \`dailyRate\` × \`rentalDays\` + \`insurancePerDay\` × days + \`addOnTotal\` → 自動 TRANSPORT expense
- \`insuranceTier\`：BASIC / PREMIUM / FULL / NONE
- \`fuelPolicy\`：FULL_TO_FULL / FULL_TO_EMPTY / PRE_PURCHASED / OTHER
- \`addOns\`, \`driverLicense\`

**FREE**
- \`plan\`：自由活動描述
- \`budget\` + \`ticketCurrency\`：預算（自動 MISC expense）
- \`alternativePlan\`：備案（雨天 / 疲累時）

**TRANSPORT_STOP**
- \`purpose\`：用途（換乘 / 寄物 / 等待）

**通用 item-level（任何 kind 都可填）**
- \`tips\`：旅行小撇步（多行字串）
- \`bringList\`：建議攜帶物品陣列，例 \`["相機","防曬"]\`

### \`days[].transports[]\`
- \`fromIndex\` / \`toIndex\`：**同一天 items 陣列的索引**（0 = 第一個 item）
- \`mode\`（可省略，預設 WALKING）：DRIVING / WALKING / TRANSIT / BICYCLING / TAXI / FLIGHT / CUSTOM
- \`durationMin\`：移動分鐘數
- \`distanceM\`：距離（公尺）
- \`fareAmount\` / \`fareCurrency\`：票價 + 3 碼貨幣
- \`transitLine\`：路線名（如「銀座線」「JR 山手線」「中央線快速」）
- \`notes\`：備註

## 重要規則

1. \`schemaVersion\` 必須是 \`1\`（保留欄位以便未來擴充）
2. **不確定的欄位請省略，不要編造**
3. 時間用 \`HH:MM\` 24 小時制；日期用 \`YYYY-MM-DD\`
4. \`days\` 必須涵蓋 trip 範圍內的每一天（可以有沒安排的空白日，items 給空陣列即可）
5. **請把整段 JSON 包在 \`\`\`json … \`\`\` 程式碼區塊內回給我**（這樣 ChatGPT / Claude.ai / Gemini 等對話框會自動顯示「Copy」按鈕，我直接點就好；不要加任何前後說明文字、不要分多個 code block）
`;
