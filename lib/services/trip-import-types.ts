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

export const importItemSchema = z.object({
  kind: SCHEDULE_KIND.optional().default("ATTRACTION"),
  name: z.string().min(1).max(120),
  address: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  startTime: HHMM.optional(),
  durationMin: z.number().int().min(0).max(24 * 60).optional(),
  isAllDay: z.boolean().optional().default(false),
  note: z.string().max(2000).optional(),
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
export const TRIP_IMPORT_SCHEMA_DOC = `# 旅遊規劃 Z — 行程匯入 JSON 格式

請依照以下 JSON 格式輸出我的旅遊行程。直接貼回 JSON（不要包 \`\`\`），我會用 app 的「外部貼入」功能匯入。

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
          "startTime": "14:00",
          "durationMin": 90,
          "note": "雷門進、寶藏門出"
        },
        {
          "kind": "MEAL",
          "name": "築地壽司大",
          "startTime": "18:30",
          "durationMin": 60
        },
        {
          "kind": "LODGING",
          "name": "東橫 INN 淺草",
          "isAllDay": true
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
  - \`FLIGHT\`：飛航段（要在 trip 中當作行程項目，而非交通段）
  - \`CAR_RENTAL\`：租車
  - \`TRAIN\`：火車
- \`name\`（必填）：地名
- \`address\`：地址（不確定可省略）
- \`lat\` / \`lng\`：經緯度（不確定可省略，匯入後地圖上不會顯示 pin）
- \`startTime\`：HH:MM 24 小時制（不填則自動接續前一個項目）
- \`durationMin\`：滯留分鐘數（不填則用該類型預設值）
- \`isAllDay\`：true 時佔整天（適用 LODGING）
- \`note\`：自由文字備註

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
5. 直接回 JSON 即可，不要包在 \`\`\`json\`\`\` 區塊內
`;
