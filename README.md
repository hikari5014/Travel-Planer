# 旅遊規劃 Travel Planner

個人用的複雜旅遊行程規劃網頁工具，整合景點搜尋（Google Maps）、排程拖曳、費用試算、多方案對比、AI 行前建議與 PDF 旅遊手冊匯出於一身。

> 目前狀態：**Phase 0a — 設計系統 + 視覺 Demo 完成**。下一步進入 Phase 0b（Prisma + SQLite 真資料層）。完整路線圖見 [`plan.md`](./plan.md)。

---

## 快速開始

需求：Node.js ≥ 22、pnpm ≥ 10。

```bash
pnpm install
pnpm dev
# → http://localhost:3000
```

可體驗的頁面（純前端 + mock 資料）：

| 路由 | 內容 |
|---|---|
| `/` | 工具儀表板（旅程列表 + 快速開始） |
| `/trips/kyoto-7d` | 主編輯器：橫向 Day strip + List/週視圖切換 + 風格化地圖 + 浮動景點卡 |
| `/trips/kyoto-7d/compare` | 多方案完整對比（含日期/區間 scope 選擇器） |
| `/trips/kyoto-7d/export` | PDF 匯出 demo（紙張/方向/字級/章節即時預覽） |

**Shift+click** 編輯器頂部的方案 pill 可進入「列表內方案對比」模式（自動收折地圖）。

---

## 功能概覽

### Phase 0a 已完成（視覺 Demo）
- ✅ Cal.com 風格設計系統（白底 + 黑 CTA + Inter 600）
- ✅ 4 個主要頁面的視覺與互動
- ✅ Lucide 圖示 + 自動依景點類別 resolve
- ✅ 浮動可拖曳景點卡（全頁 viewport drag）
- ✅ 週視圖：拖曳平移 + Cmd+滾輪縮放時間軸 + 自動置中所選日
- ✅ List view 內方案對比 + 自動收折地圖
- ✅ 完整對比頁的 scope selector（單天 / 區間 / 整趟）
- ✅ PDF 匯出多頁預覽（含全趟地圖 + Day spread + 行李 checklist + 費用總表 + 票卷附頁）
- ✅ 貨幣換算（主幣 + 灰小字當地幣，≥ 100 萬才用 .M 縮寫）
- ✅ 紙張大小（A4/A5/Letter）真實 mm-based 比例 + 直/橫向真正 re-layout

### 下一步（Phase 0b 起）
- ⏳ Prisma + SQLite 接真資料
- ⏳ Trip CRUD + Settings + JSON 全 DB 匯出/匯入
- ⏳ Google Maps Platform 真接入（Places + Directions + Static Maps）
- ⏳ 拖曳排程觸發 Transport 重算
- ⏳ AI provider 抽象層（OpenAI / Anthropic 切換）
- ⏳ 實際 PDF 輸出（@react-pdf/renderer）

---

## 架構摘要

```
規劃旅遊網站/
├─ app/                          # Next.js 15 App Router
│   ├─ page.tsx                  # Dashboard
│   ├─ trips/[tripId]/
│   │   ├─ page.tsx              # 主編輯器
│   │   ├─ compare/page.tsx      # 完整對比
│   │   └─ export/page.tsx       # PDF 匯出
│   ├─ globals.css
│   └─ layout.tsx
├─ components/
│   ├─ brand/                    # 品牌標
│   ├─ common/                   # 跨頁元件（PriceWithLocal）
│   ├─ compare/                  # 對比相關
│   ├─ editor/                   # 編輯器（list/grid/map/floating card）
│   ├─ export/                   # PDF 預覽
│   ├─ layout/                   # Top nav / Footer
│   └─ trip/                     # Trip card
├─ lib/
│   ├─ mock-trips.ts             # 假 Trip 資料
│   ├─ mock-schedule.ts          # 假 Day/Item/Place/Transport/Plan
│   ├─ place-icon.tsx            # category → Lucide icon resolver
│   ├─ currency.ts               # 12 幣別 mock rates
│   └─ export-config.ts          # PDF 設定 + paperPx
├─ tailwind.config.ts            # Cal.com tokens
├─ plan.md                       # 主架構文件（最新版）
├─ CLAUDE.md                     # Claude Code 工作指引
├─ 參考檔案/
│   ├─ DESIGN-cal.md             # 當前設計系統
│   └─ DESIGN-claude.md          # 早期 Anthropic 風格（已不採用）
└─ package.json
```

---

## 技術棧

| 用途 | 套件 |
|---|---|
| Framework | Next.js 15 App Router + React 19 |
| Language | TypeScript 5.9 |
| Styling | Tailwind 3.4 + 自訂 token（DESIGN-cal.md） |
| Icons | lucide-react ^1.11 |
| Fonts | Inter（顯示+內文）/ Noto Sans TC / JetBrains Mono |

Phase 0b+ 將加入：Prisma + SQLite、Zustand、TanStack Query、dnd-kit、@vis.gl/react-google-maps、Vercel AI SDK、Zod、@react-pdf/renderer。

---

## 設計系統

當前採用 **Cal.com**（[`參考檔案/DESIGN-cal.md`](./參考檔案/DESIGN-cal.md)）：
- Canvas: `#ffffff` 白
- Primary: `#111111` 近黑
- Accent badges: `#fb923c` orange / `#ec4899` pink / `#8b5cf6` violet / `#34d399` emerald
- Display: Inter 600 + 負字距（Cal Sans 替身）
- Body: Inter 400 / 500
- Surface dark（footer）: `#101010`

所有 token 在 `tailwind.config.ts` 集中管理；新元件不引入新顏色，只組合現有 token。

---

## 指令

```bash
pnpm dev          # 開發伺服器（turbopack）
pnpm typecheck    # 純 TS 檢查
pnpm build        # 產出生產版
pnpm start        # 跑生產版
```

---

## 文件

- [`plan.md`](./plan.md) — 完整架構、領域模型、Phase 路線圖、決策紀錄
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code 在這個 repo 的工作守則
- [`參考檔案/DESIGN-cal.md`](./參考檔案/DESIGN-cal.md) — 當前設計系統規範
