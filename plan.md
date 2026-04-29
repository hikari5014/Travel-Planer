# 旅遊規劃Z (Travel Planner Z) — 主架構文件

> 版本：v0.9 (+ Phase 7a 多用戶基礎 / Phase 8 共享連結 / Phase 9 Google Routes 真路線)
> 更新日期：2026-04-30
> 工作目錄：`/Users/l.iko/Claude Work Space/Claude Code/規劃旅遊網站`

---

## 0. Context（為什麼要做這個）

**個人用**的複雜旅遊行程規劃網頁工具，未來計畫擴充為多人 SaaS。核心痛點：
- 現有工具（Google My Maps、Notion、Excel）做不到「景點 + 排程 + 地圖距離 + 多方案費用對比」一氣呵成
- 想用 AI 自動產生行前注意事項與行李 checklist，且要能換 LLM provider
- 想一鍵輸出 A4 旅遊手冊 PDF
- 預期未來會擴充為多人 SaaS，所以技術選型必須能無痛遷移

**已確定的核心決策**：本地端自用（SQLite 起步）→ Next.js 全端 → AI provider 可換接（先做設定介面手動輸入 Key）→ Google Maps Platform → 工具儀表板感（不是行銷頁）→ 設計語言 = **Cal.com**（白底 + 黑 CTA + Inter 600 顯示字 + 4 種 pastel badge）。

---

## 1. 目前狀態（Phase 0b 完成）

### 已完成（Phase 0a + 0b）
- ✅ Next.js 15 App Router + TypeScript + Tailwind + Inter / Noto Sans TC / JetBrains Mono 字型
- ✅ 完整設計系統 token（DESIGN-cal.md → tailwind.config.ts）
- ✅ 工具儀表板首頁（`/`）：workspace title、stat strip、繼續上次編輯、快速開始、所有旅程 grid
- ✅ 旅程編輯器（`/trips/[tripId]`）：橫向 Day strip + 兩欄可調整寬度（list / map）+ 浮動可拖曳景點卡（fixed + Portal，視窗任意拖曳）
- ✅ List view + Week Grid view 切換（Cmd+wheel zoom、Shift+wheel 橫捲、拖曳平移、自動置中所選日；切到週視圖自動隱藏 Day strip）
- ✅ List view 內方案對比（Shift+click 多選 plan、自動收折地圖、複製到 plan 按鈕）
- ✅ 完整對比頁（`/trips/[tripId]/compare`）：scope 選擇器（整趟 / 單天 / 區間）+ 三欄並列 + 指標總覽表
- ✅ PDF 匯出 demo 頁（`/trips/[tripId]/export`）：紙張大小（A4/A5/Letter mm-based 縮放）+ 方向（直/橫）+ 字級 + 彩色/單色 + 章節 toggle + 預估頁數，右側即時預覽 8–10 頁
- ✅ 浮動景點卡：拖曳/ESC/✕/點地圖空白關閉
- ✅ Lucide-react 取代所有 emoji（icon 由 category 自動 resolve，使用者可手動覆寫）
- ✅ 貨幣換算：mock rates + `<PriceWithLocal>`（NT$ 78,400 主幣 + ¥ 373,184 灰色當地幣下方），不使用 .k 縮寫，只在 ≥ 100 萬時用 .M
- ✅ **Phase 0b**：Prisma 6 + SQLite + 完整 ER schema + 初始 migration + seed（kyoto + tokyo + yilan 真資料）
- ✅ **Phase 0b**：lib/db.ts singleton、lib/crypto.ts (AES-256-GCM)、`server-only` 隔離
- ✅ **Phase 0b**：trip-service / settings-service / backup-service（Zod 4 schema 校驗）
- ✅ **Phase 0b**：Dashboard `/` 改接真 DB；新增旅程 dialog（Server Action）+ 自動建 Plan + 7 Days
- ✅ **Phase 0b**：`/settings` 頁完整功能（幣別、油費、Google Maps key 加密儲存、LLM provider CRUD、JSON 備份）
- ✅ **Phase 0b**：`/api/backup` GET/POST endpoint，全 DB JSON round-trip

### 進行中
無

### 下一步
所有規劃 Phase（0a / 0b / 1a / 1b / 2 / 3 / 4 / 5）已全部完成。後續為 **Phase 6+**：Postgres 遷移、多人帳號、共享/協作、行動裝置優化、離線快取。

### 新增完成（v0.5）
- ✅ **Phase 1b**：WeekGridView block 拖曳改時段 / 跨日移動 / 底邊 resize 改時長（5 分鐘 snap，optimistic preview，落地 server action）
- ✅ **Phase 1b**：Google Maps 整合（@vis.gl/react-google-maps + AdvancedMarker + Polyline + auto-fit bounds，Settings 有 Maps Key 時自動切換）
- ✅ **Phase 5**：@react-pdf/renderer Document tree（9 個章節組件，色彩/單色 palette、字級倍率、紙張橫直自適應）
- ✅ **Phase 5**：`/api/export/pdf` POST endpoint（接受 ExportConfig，server-side 渲染為 Buffer 直接下載）
- ✅ **Phase 5**：ExportControls 下載按鈕（useTransition pending state、錯誤訊息顯示、Content-Disposition UTF-8 檔名）
- ✅ **Phase 5**：可選 CJK 字型註冊（`public/fonts/NotoSansTC-Regular.{ttf,otf}` 自動偵測；不存在時 fallback Helvetica）

---

## 2. 技術棧

| 層級 | 選擇 | 狀態 |
|---|---|---|
| 框架 | **Next.js 15 App Router + TypeScript** | ✅ |
| UI 元件 | **shadcn/ui（Radix + Tailwind）** | 待安裝（Phase 0b） |
| 設計系統 | **DESIGN-cal.md**（Cal.com 品牌：白底 + 黑 CTA + Inter 600 顯示字） | ✅ Tailwind config 完整對齊 |
| 字型 | Inter（顯示+內文）+ Noto Sans TC（CJK fallback）+ JetBrains Mono（程式碼） | ✅ |
| 狀態管理 | **Zustand** | 待加入（Phase 1a） |
| 伺服器狀態 | **TanStack Query v5** | 待加入（Phase 0b） |
| ORM | **Prisma** | 待加入（Phase 0b） |
| DB（Phase 0–5） | **SQLite (`prisma/dev.db`)** | 待加入 |
| DB（未來 SaaS） | **Postgres (Supabase/Neon)** | 規劃中 |
| 拖曳 | **dnd-kit** | 待加入（Phase 1a） |
| 地圖元件 | **@vis.gl/react-google-maps** | 待加入（Phase 1a，目前 SVG mock） |
| AI 抽象 | **Vercel AI SDK** + Zod structured output | 待加入（Phase 4） |
| Schema 驗證 | **Zod** | 待加入（Phase 0b） |
| 表單 | **React Hook Form + Zod resolver** | 待加入（Phase 0b） |
| 時間 | **date-fns** | 待加入（不處理時區） |
| PDF | **@react-pdf/renderer** + 預覽介面（已建好 visual mock） | 待加入（Phase 5） |
| Icon | **lucide-react ^1.11.0** | ✅ |
| 加密 | **Node crypto AES-256-GCM** | 待加入（Phase 0b） |

---

## 3. 領域模型（Domain Model）

### 3.1 ER 圖

```mermaid
erDiagram
    Trip ||--o{ Plan : "has many"
    Plan ||--o{ Day : "contains"
    Day ||--o{ ScheduleItem : "ordered"
    ScheduleItem }o--|| Place : "references"
    ScheduleItem ||--o{ Ticket : "may have"
    ScheduleItem ||--o{ Expense : "may incur"
    ScheduleItem ||--o| Transport : "outgoing leg"
    Transport }o--o| Place : "parking suggestion"
    Transport ||--o{ Expense : "fuel/fare"
    Ticket ||--|| Expense : "1:1 auto-sync"
    Plan ||--o{ AISuggestion : "cached"
    Place ||--o{ PlacePhoto : "has"

    Trip { string id PK; string title; date startDate; date endDate; string baseCurrency; string defaultPlanId }
    Plan { string id PK; string tripId FK; string name; int displayOrder; string forkedFromPlanId }
    Day { string id PK; string planId FK; date date; int dayIndex }
    ScheduleItem { string id PK; string dayId FK; string kind "ATTRACTION|MEAL|LODGING|TRANSPORT_STOP|FREE"; string placeId FK; time startTime; time endTime; int suggestedDurationMin; int orderIndex; bool isAllDay; bool isTimeLocked; string note }
    Place { string googlePlaceId PK; string name; float lat; float lng; string primaryType; json types; float rating; int defaultStayMinutes; string defaultStaySource "HEURISTIC|AI|USER_OVERRIDE"; string iconKey; datetime detailsExpireAt }
    PlacePhoto { string id PK; string googlePlaceId FK; string photoReference; string localCachePath; int widthPx }
    Transport { string id PK; string fromScheduleItemId FK; string toScheduleItemId FK; string mode "DRIVING|TRANSIT|WALKING"; int distanceMeters; int durationSec; json polyline; string parkingPlaceId FK; decimal estimatedCost }
    Ticket { string id PK; string scheduleItemId FK; string category; string title; decimal price; string currency; int quantity; string bookingRef; string fileAttachmentPath; string expenseId FK }
    Expense { string id PK; string tripId FK; string planId FK; string scheduleItemId FK; string transportId FK; string ticketId FK; string category "FOOD|LODGING|TRANSPORT|TICKET|SHOPPING|MISC"; decimal amount; string currency; decimal fxRateToBase }
    AISuggestion { string id PK; string planId FK; string kind "PRE_TRIP_NOTES|PACKING_CHECKLIST"; json input; json output; string providerId; string model; datetime generatedAt }
    Settings { string id PK "singleton"; json llmProviders "key 加密"; string defaultProviderId; string defaultModel; string googleMapsApiKeyEnc; json defaultStayMinutesByType; decimal defaultFuelPricePerLiter; decimal defaultFuelEfficiencyKmPerL; string baseCurrency; string localCurrency; json fxRates; datetime fxFetchedAt; decimal monthlyBudgetUsd }
```

### 3.2 額外 Entity：ApiUsageLog（用量儀表）

```
ApiUsageLog {
  id PK
  service "GOOGLE_PLACES_AUTOCOMPLETE | GOOGLE_PLACES_DETAILS | GOOGLE_PLACES_PHOTO | GOOGLE_PLACES_NEARBY | GOOGLE_DIRECTIONS | GOOGLE_STATIC_MAPS | LLM_CHAT | LLM_GENERATE_OBJECT"
  providerId       "LLM 才填，例 openai/anthropic"
  model            "LLM 才填"
  promptTokens     int  "LLM 才填"
  completionTokens int  "LLM 才填"
  estimatedCostUsd decimal
  occurredAt datetime
  metadata json   "例：placeId, planId 等便於追蹤"
}
```

### 3.3 關鍵關係

- **Plan ↔ Trip**：一 Trip 有多 Plan，每 Plan 是**獨立完整編排**（深拷貝 Day/ScheduleItem/Transport/Expense）。複製時 Place 不複製（共享快取）。支援 `duplicatePlan` + `copyItemsToPlan`（部分複製插入）。
- **Place 共享快取**：以 `googlePlaceId` 為主鍵，全 DB 唯一，跨 Trip 共享。30 天 TTL 後重抓。
- **Transport ↔ ScheduleItem**：有向邊 `from→to`。每相鄰兩個 ScheduleItem 自動建一條 Transport；拖曳/刪除自動失效並重算。
- **Ticket ↔ Expense（1:1 自動）**：Ticket = 使用者描述、Expense = 會計記錄。透過 service 層自動同步傳播。

---

## 4. 路由與頁面（目前 Phase 0a 已完成）

```
app/
├─ page.tsx                              # /  Dashboard（旅程列表 / 工具儀表板）
├─ trips/[tripId]/
│   ├─ page.tsx                          # 主編輯（Day strip + List/Grid + Map + Floating place card）
│   ├─ compare/page.tsx                  # 多方案完整對比 + scope selector
│   └─ export/page.tsx                   # PDF 匯出（控制面板 + 多頁預覽）
└─ layout.tsx                            # 字型 + lang
```

### 待新增（Phase 0b+）
```
app/
├─ trips/[tripId]/
│   ├─ expenses/page.tsx                 # 費用總覽（Phase 2）
│   └─ ai/page.tsx                       # AI 建議介面（Phase 4）
├─ settings/page.tsx                     # API keys、幣別、油費 oscars 等（Phase 0b）
└─ api/
    ├─ places/{autocomplete,details,photo,nearby-parking}
    ├─ directions
    └─ ai/{suggest,estimate-stay}
```

---

## 5. 程式碼架構（已完成的目錄）

```
規劃旅遊網站/
├─ app/
│   ├─ page.tsx                       # Dashboard
│   ├─ layout.tsx                     # Font wiring
│   ├─ globals.css                    # display-xl/lg/md/sm classes
│   └─ trips/[tripId]/
│       ├─ page.tsx                   # Editor
│       ├─ compare/page.tsx           # Compare
│       └─ export/page.tsx            # Export demo
├─ components/
│   ├─ brand/SpikeMark.tsx            # Cal-style brand mark (filled circle with notch)
│   ├─ common/PriceWithLocal.tsx      # 主幣 + 當地幣 dual display
│   ├─ compare/CompareScopeBar.tsx    # 整趟 / 單天 / 區間 切換器
│   ├─ editor/
│   │   ├─ EditorHeader.tsx           # Plan switcher (Shift+click multi-select) + view toggle + actions
│   │   ├─ TopDayStrip.tsx            # 橫向 Day pill strip + 統計 + 匯率徽章
│   │   ├─ ResizablePanes.tsx         # 兩欄拖曳分隔
│   │   ├─ ScheduleListView.tsx       # 縱向時間軸卡片 + transport row
│   │   ├─ ScheduleListCompare.tsx    # List view 內方案對比（多欄並列）
│   │   ├─ WeekGridView.tsx           # 週視圖（拖曳/wheel zoom/center on open）
│   │   ├─ MapPanel.tsx               # 風格化 SVG 地圖 (Phase 1a 接 Google Maps)
│   │   └─ FloatingPlaceCard.tsx      # 視窗任意拖曳的景點詳情卡（Portal + fixed）
│   ├─ export/
│   │   ├─ ExportControls.tsx         # PDF 設定面板
│   │   └─ PdfPreview.tsx             # 多頁預覽（cover/toc/tripMap/preTripNotes/checklist/day/cost/tickets/back）
│   ├─ layout/
│   │   ├─ TopNav.tsx                 # Dashboard 頂部導覽
│   │   └─ Footer.tsx                 # （Dashboard 已不使用，留作未來）
│   └─ trip/TripCard.tsx              # 旅程卡片（icon-based 封面）
├─ lib/
│   ├─ mock-trips.ts                  # 假 Trip 資料 + formatTwd（>= 1M 才用 .M）
│   ├─ mock-schedule.ts               # 假 Day/ScheduleItem/Place/Transport + Plans
│   ├─ place-icon.tsx                 # Category → Lucide icon resolver（系統自動）
│   ├─ currency.ts                    # 12 種幣別 mock rates + convert / format
│   └─ export-config.ts               # PDF ExportConfig + paperPx (mm-based)
├─ tailwind.config.ts                 # Cal.com tokens 完整對應
├─ postcss.config.mjs
├─ next.config.ts
├─ tsconfig.json
├─ package.json                       # next 15 + react 19 + tailwind 3 + lucide
├─ pnpm-lock.yaml
├─ plan.md                            # 本文件
├─ README.md
├─ CLAUDE.md
└─ 參考檔案/
    ├─ DESIGN-cal.md                  # 當前採用的設計系統
    └─ DESIGN-claude.md               # Phase 0a 早期版本，已換掉
```

---

## 6. 細節決策（全部已定案）

| # | 決策 | 結果 |
|---|---|---|
| Q1 | 滯留時間估算 | **C 啟發式 + AI 重估按鈕**（Phase 1 啟發式表，Phase 4 AI 重估） |
| Q2 | 停車場推薦 | **依 Transport.mode 自動分流**（DRIVING 段才提示、TRANSIT/WALKING 自動跳過、不打 AI） |
| Q3 | PDF 模板 | **固定模板 + 預覽/調整介面**（紙張/方向/字級/彩色單色/章節 toggle 全部即時連動，✅ Phase 0a 已 demo） |
| Q4 | 多方案對比上限 | **3 個** |
| Q5 | 時區 | **不處理**（所有時間皆為當地時間） |
| Q6 | Plan 同步 | **完全獨立**，提供 `duplicatePlan` 與 `copyItemsToPlan`（部分複製插入） |
| Q7 | 時間衝突 | **軟性紅框警告**（週視圖偵測重疊但不阻擋） |
| Q8 | AI 輸出語言 | **中英對照**（重點欄位 `{ zh, en }`，敘述只出繁中） |
| Q9 | API 用量儀表 | **Phase 4 加入**（`/settings#usage`，每月 token / call 統計，超 budget 警示） |
| Q10 | 資料備份 | **Phase 0b 加 JSON 全 DB 匯出/匯入** |

### 設計語言重大切換
- **舊**：Anthropic Claude.com（cream canvas + 珊瑚紅）
- **新（當前）**：Cal.com（白底 + 黑 CTA + Inter 600 + 4 種 pastel badge）
- 切換已完整套用到所有頁面、所有元件、所有 token

### Phase 0a 期間追加需求紀錄
- ✅ 浮動景點卡 → 全頁可拖曳（Portal + fixed）
- ✅ 週視圖 → 固定欄寬 + 拖曳平移 + Cmd 滾輪縮放 + 自動置中所選日 + 切過去自動隱藏 Day strip
- ✅ 列表視圖 → 方案對比 mode（Shift+click 多選、自動收折地圖、複製到 plan）
- ✅ 完整對比頁 → scope 選擇器（單天/區間/整趟）並依範圍 scale 金額
- ✅ DAYS bar → 每個 pill 內「DAY N」label 在上、日期在下（與週視圖欄頭一致）+ pill 之間加 hairline 分隔
- ✅ 切到週視圖自動收 Day strip
- ✅ Icon 系統 → 移除所有 emoji，用 lucide-react，category → icon 自動 resolve
- ✅ 貨幣 → 主幣 + 當地幣灰小字下方，**不使用 .k**，只有 ≥ 100 萬才換 .M
- ✅ PDF 紙張 → 真實 mm-based 比例，A4/A5/Letter 視覺差異明顯
- ✅ PDF 橫向 → cover/day spread 真正 re-layout（不只是裁切）
- ✅ PDF → 新增「全趟地圖」章節（每天用不同顏色路線）

---

## 7. Phase 切割（更新版）

| Phase | 範圍 | 狀態 |
|---|---|---|
| **Phase 0a：設計系統 + Demo** | Next.js scaffold、Tailwind tokens、字型、Cal.com 視覺套用、4 個主要頁面的視覺 demo（dashboard / editor / compare / export） | ✅ **完成** |
| **Phase 0b：地基** | Prisma schema、SQLite、Trip CRUD（接真資料）、Settings singleton、加密工具、JSON 全 DB 匯出/匯入 | ✅ **完成** |
| **Phase 1a：MVP 列表視圖** | Place 搜尋（本地快取）+ ScheduleItem CRUD + 啟發式滯留時間 + Haversine/mapPx 距離 fallback + Transport 自動建立 + dnd-kit 拖曳 | ✅ **完成** |
| **Phase 1b：週視圖接 DB + Google Maps** | Week Grid block 拖曳改時段 / 跨欄移動換日 / 底邊 resize 改時長（5 分鐘 snap），全部寫回 `updateItemTimes`/`moveItemToDay`；@vis.gl/react-google-maps 整合，Settings 有 Maps Key 時自動切換為真實地圖（fallback 仍是 SVG mock） | ✅ **完成** |
| **Phase 2：費用 + 票卷 + FX** | Expense / Ticket service（1:1 自動同步）、`/expenses` 頁、frankfurter.app live FX | ✅ **完成** |
| **Phase 3：多方案複製** | duplicatePlan deep-clone、setDefaultPlan、`/compare` 接真 DB | ✅ **完成（部分）**（scope selector 待補） |
| **Phase 4：AI 行前建議 + 用量** | provider 抽象（OpenAI / Anthropic 直接 fetch）、generateJson + Zod、`/trips/[id]/ai` 頁、ApiUsageLog 寫入點、`/settings#usage` 區塊（已建立元件，未連到 settings 頁） | ✅ **完成（部分）** |
| **Phase 5：PDF 真匯出** | @react-pdf/renderer Document tree（cover/toc/tripMap/preTripNotes/packingChecklist/dailySchedule/costSummary/tickets/backCover）+ `/api/export/pdf` 路由 + ExportControls 下載觸發；CJK 字型透過將 `NotoSansTC-Regular.ttf/otf` 放入 `public/fonts/` 啟用，否則 fallback 至 Helvetica（英文 OK，中文顯示為框） | ✅ **完成** |
| **Phase 1b：週視圖（接真資料）** | 把目前的 visual demo 接 Prisma；click-to-create popover 真存資料；resize → updateScheduleItem | 規劃 |
| **Phase 2：費用 + 票卷** | Expense CRUD、Ticket↔Expense 自動同步、Transport 油費試算、`/expenses` 頁、幣別 API 連線（frankfurter.app/exchangerate.host） | 規劃 |
| **Phase 3：多方案對比 + 停車場** | Plan duplicate / copyItemsToPlan、compare 頁三欄並列接真資料、scope 範圍計算、DRIVING 段 Nearby parking | 規劃 |
| **Phase 4：AI 建議 + 用量儀表** | Vercel AI SDK + provider abstraction、行前注意 + 行李 checklist（中英對照 schema）、AI 重估滯留時間、ApiUsageLog 儀表板 | 規劃 |
| **Phase 5：PDF 匯出（接 @react-pdf/renderer）** | 把目前 visual demo 換成 `<Document>/<Page>/<View>/<Text>` 元件樹、Static Maps 整合、實際下載 / 列印 | 規劃 |
| **Phase 6+** | Postgres 遷移、多人帳號、共享/協作、行動裝置優化、離線快取 | 未來 |

---

## 8. Phase 0b 啟動條件清單

進入 Phase 0b 之前必須完成：
1. ✅ git init + first commit
2. ✅ README.md + CLAUDE.md 寫好
3. ✅ plan.md 更新到當前狀態
4. **Phase 0b 第一步：** 安裝 Prisma + 設計完整 schema → migrate dev → 把 mock-trips/mock-schedule 改成從 DB 讀取

---

## 9. Critical Files（已建立 + 待建立）

### 已建立（Phase 0a）
- `tailwind.config.ts` — 完整 Cal.com tokens
- `app/globals.css` — display-xl/lg/md/sm 類別 + scrollbar utilities
- `lib/place-icon.tsx` — 19 種 PlaceIconKey + auto resolver
- `lib/currency.ts` — 12 幣別 + convert/format（無 .k 縮寫）
- `lib/export-config.ts` — PDF 設定 + mm-based paperPx
- `components/editor/FloatingPlaceCard.tsx` — Portal + fixed + viewport drag
- `components/editor/WeekGridView.tsx` — pan/zoom/center
- `components/editor/MapPanel.tsx` — 風格化 SVG（Phase 1a 替換為 Google Maps）
- `components/export/PdfPreview.tsx` — 8 個章節元件 + landscape 適配

### Phase 0b 待建立
- `prisma/schema.prisma` — 完整 schema（含 ApiUsageLog、ScheduleItem.isAllDay/isTimeLocked、Settings.fxRates）
- `src/server/db/index.ts` — Prisma client singleton
- `src/server/services/trip-service.ts` — Trip CRUD
- `src/server/services/settings-service.ts` — Settings + API key 加密
- `src/server/services/backup-service.ts` — JSON 全 DB 匯出/匯入
- `lib/crypto.ts` — AES-256-GCM 加解密
- `app/settings/page.tsx`

### Phase 1a 待建立
- `src/server/services/schedule-service.ts` — 拖曳重排與 Transport 重算協調
- `src/server/services/place-service.ts` — Google Places 代理與快取
- `src/server/google/{places,directions,static-maps}.ts`
- `src/features/schedule/useDragSchedule.ts`

### Phase 4 待建立
- `src/server/providers/registry.ts` — AI provider 註冊與切換
- `src/server/services/ai-service.ts` — facade
- `src/features/settings/UsageDashboard.tsx`

---

## 10. Verification（每 Phase 驗收點）

- ✅ **Phase 0a**：四個主要頁面 (`/`、`/trips/[id]`、`/trips/[id]/compare`、`/trips/[id]/export`) 視覺 demo 完成；切換 plan 對比、week view 拖曳/zoom/center、export 紙張橫向、貨幣換算、icon 自動 resolve 都即時連動。
- **Phase 0b**：`pnpm prisma migrate dev` 通過、`/` 切換到接真資料、可建立 Trip、`/settings` 可進入、加密工具有單元測試、JSON 匯出/匯入 round-trip 資料一致。
- **Phase 1a**：搜尋「東京晴空塔」可加入 Day 1、拖到 Day 2 後地圖 polyline 自動更新、Directions API 確實被呼叫且結果存進 Transport。
- **Phase 1b**：視圖切換器可切；週網格點空格可新增；拖曳 GridItem 改時段與換日；resize 改時長；重疊紅框；All-day 通鋪列正常；切視圖後選取與滾動位置保留。
- **Phase 2**：建立 Ticket 後 `/expenses` 立刻看到對應記錄、改 Ticket 金額後 Expense 同步、刪除 Ticket 後 Expense 消失、Transport 油費依 Settings 自動算進總費用、幣別 API 重整能拿到最新匯率。
- **Phase 3**：複製 Plan 後修改不影響原 Plan、多選 ScheduleItem 複製到另一 Plan 成功且 Transport 重算、compare 頁三欄正確顯示差異、自駕段顯示停車場提示且選擇後寫入 `parkingPlaceId`、TRANSIT 段不顯示停車場 UI。
- **Phase 4**：在 Settings 加入 OpenAI 與 Anthropic key 各一筆，切換 provider 後產生的 AISuggestion 都能正確存入 DB、結構符合 Zod schema 且中英對照欄位齊全；景點卡按 AI 重估滯留時間後 Place.defaultStaySource=AI；Settings 用量區塊正確顯示本月各 service 統計。
- **Phase 5**：匯出的 PDF 在 macOS Preview 開啟，每日地圖縮圖正確、票卷與費用表完整；切換 A4/A5/Letter、字級大小、章節開關後預覽即時更新且下載結果一致；列印無內容溢出。

每 Phase 結束跑一次：`pnpm typecheck`（後期加 `pnpm lint && pnpm test`）。

---

## 11. 重大架構不變原則

1. **設計系統絕不混合**：Cal.com tokens 是唯一來源，新元件查 `tailwind.config.ts` 與 DESIGN-cal.md，不引入新顏色/字型。
2. **服務層 vs Server Actions**：所有領域邏輯放 `src/server/services/`，Server Actions 只做薄薄的 input 驗證 + service 呼叫。
3. **Prisma → SQLite → Postgres**：schema 不為了 SQLite 妥協；任何 Postgres-only feature（JSONB query 等）暫不使用。
4. **API key 絕不出前端**：Google Maps Server key + LLM keys 都在 Settings 加密儲存 + server-side proxy；前端 referer-restricted JS key 限定 host。
5. **時區**：所有 startTime/endTime 都當作該地當地時間，DB 不存 UTC，不轉換。
6. **Place 共享**：以 googlePlaceId 為主鍵，跨 Trip 共享，使用者自訂放在 ScheduleItem 上。
7. **Plan 隔離**：複製是深拷貝，Place 不複製。
8. **Ticket → Expense 強制同步**：透過 service 層 `syncTicketExpense`，不靠 DB trigger（保留遷移彈性）。

---

## 12. 已知限制 / 待研究

- **Cal Sans 字體**：Cal.com 商用字型，未授權；目前用 Inter 600 + -0.04em 替代。如未來自架可考慮 Manrope 700。
- **Cormorant Garamond / Noto Serif TC**：已從 layout.tsx 移除（DESIGN-claude.md 時期遺留）。
- **Google Static Maps 中文標籤**：Phase 5 時要確認標籤語言設定 `language=zh-TW`。
- **單機 → 多人遷移**：Settings.singleton 改成 `userId` PK 時要寫遷移腳本；本地用戶 → 第一個 SaaS 帳號要有 import 機制。
- **PDF 中文字型**：@react-pdf/renderer 不會自動嵌入 CJK 字型，Phase 5 要 register Noto Sans TC。

---

## 13. 地圖供應商與大眾運輸 API（Phase 6a 採用）

### 13.1 三軌地圖供應商（已實作）

| 供應商 | 何時用 | 費用 | 備註 |
|---|---|---|---|
| **Google Maps** | 行程在日韓台 / 需大眾運輸 / 需精準 Places | $200/月 免費 credit ≈ 28k 載圖 | Maps JS + Places (New) + Directions 三個 API；需綁卡 |
| **Mapbox** | 歐美行程 / 重視視覺 / 不想綁卡 | 50k 載圖/月免費 | Public token (`pk.*`) referer-restricted；Search Box 為 POI 來源 |
| **OpenStreetMap (MapLibre)** | 0 成本 / 個人用 / 無 POI 需求 | 完全免費 | 無 key、tile.openstreetmap.org 直接拉；Nominatim 為搜尋備援 |

切換邏輯：使用者在 `/settings#地圖供應商` 用 `MapProviderPicker` 一鍵切換 → 寫進 `Settings.mapProvider` → `EditorShell` 依 provider 透過 `next/dynamic` lazy-load 對應 panel；缺 key 時 fallback 至 OSM → SVG mock。

### 13.2 大眾運輸 API 規劃（Phase 6+ 漸進整合）

**現況**：Transport 段的 `transitLine` 由 AI 估算（`suggestTransport`）或使用者手動填入。下一階段可依目的地接真實 transit API：

| 地區 | API | 費用 | 整合難度 | 備註 |
|---|---|---|---|---|
| 🇹🇼 台灣 | **TDX 運輸資料流通服務** | 完全免費 | 低 | 政府開放，REST + JSON；註冊取得 client_id/client_secret |
| 🇯🇵 日本 | **Google Directions API** | 同 GMP | 低（已支援） | 日本 JR/地鐵覆蓋最完整 |
| 🇯🇵 日本 | **NAVITIME API** | ¥10,000/月起 | 中 | 月台級資料；個人用太貴 |
| 🇯🇵 日本 | **駅すぱあと WebサービスAPI** | 付費 | 中 | 老牌乘換案内 |
| 🇰🇷 韓國 | **공공데이터포털 (data.go.kr)** | 免費 | 中 | 政府 GTFS 開放，需 register |
| 🇰🇷 韓國 | **TMAP API** (SKT) | 免費有限額 | 中 | 路線 + 大眾運輸 |
| 🇰🇷 韓國 | **KakaoMap / Mobility API** | 免費有限額 | 中 | 韓國使用者多 |
| 🌏 全球 | **HERE Maps API** | 1k req/日免費 | 中 | 大眾運輸覆蓋第二好 |
| 🌏 全球 | **Transitland** | 完全免費 | 低 | 全球 800+ 城市 GTFS 聚合 |
| 🌏 全球 | **OpenTripPlanner** | 自架免費 | 高 | 自行部署伺服器 |

**實作建議順序**：
1. 加 Settings 欄位 `tdxClientId` / `tdxClientSecret`（AES-256-GCM 加密儲存）
2. 建 `lib/services/transit/tdx-service.ts`（OAuth + GET /api/basic/v2/Bus/EstimatedTimeOfArrival/...）
3. TransportEditDialog 加「依地區自動拉真資料」按鈕：region 含「台灣」走 TDX、含「日本」走 Google Directions、其他走 AI
4. 結果寫進 `transitDetailsJson`（JSON：班次、票價、轉乘點），UI 渲染時優先顯示真實資料

### 13.3 已實作功能（Phase 6b/6c）

- **手動編輯路線**：每段 Transport 都有 `manuallyEdited / notes / transitLine / transitDetailsJson / originLabel / destinationLabel` 欄位；`recalcDayTransports` 會跳過手動段（pair from→to 一致時保留）。
- **TransportEditDialog**：模式（步行/駕車/大眾運輸/自訂）+ 距離/時間/費用 + 路線班次 + 起訖文字覆蓋 + 備註 + 重設為自動。
- **AI 自動規劃路線**：對話框內「AI 填入」按鈕呼叫 `suggestTransport`，由 LLM 依起訖點 + region 估算結果，含台日韓大眾運輸專業知識；結果直接 patch 到表單由使用者確認後儲存。Provenance 標記為 `aiGeneratedAt`。

---

## 14. Phase 7–9 — 多用戶 / 共享 / 真路線（v0.7-0.9）

### 14.1 Phase 7a：多用戶基礎

- 新增 `lib/auth/current-user.ts` — `getCurrentUserId()` 與 `ensureCurrentUser()`。SaaS 化只需改這個 helper（讀 cookie / JWT）。
- DB schema：`Trip.userId` / `ApiUsageLog.userId` / `Settings.id` 都改成 user-scoped；舊 `singleton` row 自動 migrate 至 `default-user`。
- 所有 service（trip / editor-loader / pdf-data / fx / usage）改用 `getCurrentUserId()` 過濾。
- 寫入用 `(await ensureSettings()).id` 取代寫死的 `SETTINGS_ID`，避免讀寫不同 row。

### 14.2 Phase 8：分享連結 / 訪客自動建會員

- DB：`User { id, displayName, isGuest, createdAt, lastSeenAt }` + `TripShare { tripId, tokenHash, role, ... }` + `TripMember { tripId, userId, role }` 三表。
- `middleware.ts` Edge runtime 確保每個瀏覽器都有 `traveler_id` cookie；無資料庫接觸，cuid 由 crypto API 產生。
- `share-service.ts`：`createShareLink / listShareLinks / revokeShareLink / joinTripViaToken / listTripMembers / pingTripMembership`，全部以 SHA-256(token) 儲存，URL 才有 raw token。
- UI：`ShareDialog`（owner 管理連結 / 成員角色 / 移除）、`PresenceIndicator`（heartbeat 15s + 30s refresh，無 WebSocket）、`/trips/:id/join` landing page。
- TripCard 顯示「共編 / 唯讀 + owner 名稱」徽章區分自己擁有的旅程與被分享的旅程。
- Dev-only `/api/dev/adopt-default` route：把 cookie 設成 `default-user`，用於 Phase 8 升級時恢復舊資料。

### 14.3 Phase 9：Google Routes 真實路線（v0.9）

#### 9a · directions-service.ts

- 端點：`POST https://routes.googleapis.com/directions/v2:computeRoutes`（Routes API New，Auth via `X-Goog-Api-Key` header）
- 兩種 fieldMask：
  - `FULL_MASK`：含 transit details、travel advisory（traffic / fare）、warnings
  - `SUMMARY_MASK`：只取距離/時間/polyline/fare（給 4-mode compare）
- 模式：5 種 — DRIVING / WALKING / TRANSIT / BICYCLING / CUSTOM。
- 出發時間：`buildDepartureIso(day.date, fromItem.endTime)` 自動帶入 — 過去日期忽略以避開 API 限制。
- 失敗策略：每個 mode 獨立 try/catch，回傳 `ModeSummary { ok, error? }`，不影響其他模式。

#### 9b · 自動查詢

- `recalcDayTransports` 完成 Haversine 後立刻 `enrichDayTransportsWithDirections(dayId)`，所有非 manual transport 並行查 Google Routes，結果寫進 `encodedPolyline / fareCurrency / fareAmount / trafficLevel / directionsCacheJson`。
- 24 小時 cache TTL：`directionsFetchedAt` 與 `departureAtIso` 都符合就跳過。
- 任何錯誤都吞掉並 log，Haversine 結果留在原位（Q6 fallback 策略）。

#### 9c · 地圖渲染

- `lib/polyline.ts`：`decodePolylineToLatLng()` 用 `@googlemaps/polyline-codec`；`ROUTE_COLOR` 表（DRIVING 藍 / TRANSIT 紫 / WALKING 綠 / BICYCLING 橘 / CUSTOM 灰）；`shouldDrawPolyline()` 集中三種顯示模式邏輯。
- 三家 Map provider 都原生繪製：
  - GoogleMapPanel → `google.maps.Polyline` per Transport
  - MapboxMapPanel + OsmMapPanel → GeoJSON LineString source + line layer
  - 沒有真實 route cache 時畫虛線（Haversine fallback 視覺差異）
- Hover state：`ScheduleListView.TransportRow` `onMouseEnter/Leave` → `setHoveredTransportId` → 三個 panel 都讀同一 state，line-width 4px → 6px、opacity 0.85 → 1。
- `RouteVisibilityToggle`：3-way segmented pill（always / hover / hidden），定位地圖底中央，不撞 Google bottom controls。預設 `hover` 並寫進 localStorage。

#### 9d · TransportEditDialog 升級

- 模式選擇 5 欄 grid（含 BICYCLING）。
- 「Google Routes 路線對比」區塊：
  - 「刷新」按鈕 → `refreshTransportDirectionsAction`（重查目前模式）
  - 「比對 4 種模式」按鈕 → `compareTransportModesAction` → 4 欄 side-by-side（時間/距離/票價）
  - 點任一模式欄 → `applyTransportModeAction`（持久化 + 表單預填）
- 細節 hint：
  - TRANSIT：3-col 距離/時間/票價 + 路線班次顯示
  - DRIVING：彩色 banner 顯示順暢/中等/嚴重壅塞
- 失敗訊息透過 result envelope，actual Google error code/message 露出（含 referrer / quota / billing 提示）。

### 14.4 規劃中
- Phase 9.5 — 完整大眾運輸轉乘步驟展開（slim transitDetails JSON 寫進 MockTransport）
- Phase 9.6 — 地圖路線 hover popover（顯示距離 / 時間 / 模式徽章）
- Phase 10 — Cloudflare D1 部署（`@cloudflare/next-on-pages` + Prisma D1 adapter）
