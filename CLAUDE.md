# CLAUDE.md — 旅遊規劃工具的 Claude Code 工作守則

> 這是 Claude Code 在此專案的工作指引。每次新對話、新 session 都應該先讀完這個檔案 + [`plan.md`](./plan.md) + [`README.md`](./README.md)，再決定下一步。

---

## 1. 對話開場必做

新對話啟動時，**先做這四件事**再回應使用者：
1. 讀 [`plan.md`](./plan.md) §1（目前狀態）— 知道現在停在哪個 Phase
2. 讀 [`plan.md`](./plan.md) §6（決策清單）— 不要重新討論已 ✅ 的問題
3. 跑 `git log --oneline -10` 看最近的提交，了解最後幾步在做什麼
4. 跑 `pnpm typecheck` 確認專案目前 typecheck 過

如果 plan.md / README.md 與實際程式碼有落差，**以程式碼為準**並提示使用者更新文件。

---

## 2. 設計系統規範（強制遵守）

當前採用 **Cal.com**（[`參考檔案/DESIGN-cal.md`](./參考檔案/DESIGN-cal.md)）。**早期 Phase 0a 早期版本曾使用 Anthropic Claude.com（`DESIGN-claude.md`），已淘汰，不要回頭引用。**

### 必須遵守
- 顏色一律用 `tailwind.config.ts` 已定義的 token；不要寫 inline hex（除非在 SVG 內部）
- Display headlines 用 `display-xl/lg/md/sm` 類別（Inter 600 + 負字距）
- Primary CTA = 黑底 `bg-primary` (#111) + `text-on-primary` 白
- Accent 用 4 個 pastel：`badge-orange / badge-pink / badge-violet / badge-emerald`，brand-accent 藍 `#3b82f6` 用在地圖 polyline / 編號徽章
- Surface 階梯：`canvas` 白 → `surface-soft` → `surface-card` → `surface-strong`
- Footer 唯一深色：`surface-dark` `#101010`
- Border radius：`md=8`（按鈕/輸入框）、`lg=12`（卡片）、`xl=16`（hero）、`pill`（badge）、`full`（avatar/icon button）

### 嚴禁
- 不要引入新顏色 token，組合現有的就好
- 不要把珊瑚紅 / 米色搬回來（那是 DESIGN-claude.md 的舊系統）
- 不要在 display 字級用 700 或以下 600 以下的 weight
- 不要在 primary CTA 上放 brand-accent 或 pastel（CTA = 黑）
- 不要 emoji 當 icon — 用 `lib/place-icon.tsx` 與 lucide-react

---

## 3. 已決策的事項（不要重新討論）

[`plan.md`](./plan.md) §6 列出 Q1–Q10 全部已定案決策。摘要：

| 主題 | 結論 |
|---|---|
| 滯留時間 | 啟發式為主 + Phase 4 起加 AI 重估按鈕 |
| 停車場 | 只在 DRIVING 段提示，不打 AI |
| PDF 模板 | 固定模板 + 預覽/調整介面（已 Phase 0a demo） |
| 多方案上限 | 3 個 |
| 時區 | 不處理，全部當作當地時間 |
| Plan 同步 | 完全獨立 + 部分複製插入 |
| 時間衝突 | 軟性紅框警告，不阻擋 |
| AI 輸出 | 中英對照（重點欄位 `{ zh, en }`） |
| API 用量 | Phase 4 加儀表板 |
| 資料備份 | Phase 0b 加 JSON 全 DB 匯出/匯入 |

如果使用者想推翻其中一項，先在 plan.md §6 標註變更，再動程式碼。

---

## 4. 程式碼撰寫慣例

### 檔案組織
- `app/` — 路由（App Router）
- `components/{feature}/` — 業務元件（trip / editor / export / compare / brand / common / layout）
- `lib/` — 純資料/邏輯（mock-*, currency, place-icon, export-config）
- `src/server/` — Phase 0b 起會加（services / db / providers / google）

### 命名
- 檔名 PascalCase 元件、kebab-case 工具：`FloatingPlaceCard.tsx`、`mock-schedule.ts`
- Hook 開頭 `use*`
- Server-side service 後綴 `-service.ts`

### React 風格
- 預設 server component；用到 state / event / portal 才加 `"use client"`
- 元件 props 用 inline type literal（不抽出 type 除非 reuse 多次）
- 永遠不要寫 `forwardRef`（React 19 直接用 ref prop）

### 不要做的事
- 不要寫 docstring、不要寫多行註解區塊
- 不要為「未來可能用到」的東西做抽象 / 加 prop
- 不要為了 lint 改 logic — 先確認 lint 規則合理
- 不要在內部程式碼加錯誤處理 / null check 給「不可能發生」的 case
- 不要呼叫 `console.log` 留在 production code

### 必須做的事
- 編輯後跑 `pnpm typecheck`
- 觀察影響範圍 — 改 token 看哪些頁面會 break，改 `mock-schedule` 看 lib 與 export 兩邊是否一致
- 改 PDF 預覽時記得 portrait / landscape 都要看一次

---

## 5. 執行新需求時的流程

1. **判斷 Phase 範疇**：對照 [`plan.md`](./plan.md) §7，是當前 Phase 內 / 跨 Phase / 全新 Phase？
2. **判斷影響面**：影響哪些檔案？哪些已決策需重新檢視？
3. **小型改動**：< 50 行 + 單檔，直接改 + verify
4. **中型改動**：跨多個元件，先列改動清單給使用者，再動手
5. **架構級改動**（如改 schema、改主流程、加新路由樹）：更新 [`plan.md`](./plan.md) → 確認 → 才執行
6. **改完一律 typecheck + 視覺驗證 + 更新 plan.md / CLAUDE.md（如需要）**

---

## 6. 視覺驗證（瀏覽器測試）

使用者已開 dev server 在 `http://localhost:3000`。改完 UI 必驗：
- 用 `mcp__Claude_Preview__preview_screenshot` 截圖驗證
- 改完 token / 新增頁面要在 dashboard / editor / compare / export 四個主頁都掃過
- PDF 匯出有特殊兩個維度：portrait / landscape × A4 / A5 / Letter，改預覽務必看 2-3 種組合
- 控制台 errors 要清掉（hydration mismatch 不能放）

---

## 7. Phase 0a 完成內容（不要重做）

[`plan.md`](./plan.md) §1 列出已完成項目。摘要：
- 4 個主要頁面視覺 demo 完成
- Cal.com 設計語言完整套用
- 浮動景點卡 viewport drag、週視圖 pan/zoom/center、列表內方案對比、compare scope selector、PDF 多頁預覽、貨幣換算（無 .k）、Lucide icon 系統、A4/A5/Letter mm-based 比例

如使用者要求調整這些已完成的功能，是視覺/體驗微調 — 不需要重寫，只要 minimal patch。

---

## 8. Phase 0b 進入指引

當使用者說「開始正式執行」/「進 Phase 0b」/「換真資料」時：

1. `pnpm add prisma @prisma/client && pnpm add -D prisma`
2. `npx prisma init --datasource-provider sqlite`
3. 把 [`plan.md`](./plan.md) §3.1 + §3.2 的 ER 圖譯成 `prisma/schema.prisma`
4. `pnpm prisma migrate dev --name init`
5. 建立 `src/server/db/index.ts`（Prisma client singleton）
6. 建立 `src/server/services/{trip,settings,backup}-service.ts`
7. 建立 `lib/crypto.ts`（AES-256-GCM）+ `.env.example` 標明 `APP_ENC_KEY`
8. 把 `app/page.tsx` 的 `mockTrips` 換成從 trip-service 讀取
9. 加 `app/settings/page.tsx`（API keys、幣別、油費試算預設值）
10. JSON 全 DB 匯出/匯入 endpoint
11. 全部完成跑一次 `pnpm typecheck && pnpm build` 確認無誤
12. 更新 [`plan.md`](./plan.md) §1 與 §7 標記 Phase 0b 完成
13. git commit「Phase 0b: Prisma schema + Trip CRUD + Settings + JSON backup」

---

## 9. 與使用者溝通

- 預設用繁體中文（混入英文技術術語可接受）
- 一句話說重點 + 必要時補一段細節
- 不要在 end-of-turn 寫長 summary，使用者看 diff 知道做了什麼
- 真有不確定 / 多種選項要使用者決定 → 用 `AskUserQuestion`
- 寫程式碼期間每次 edit 後給一句進度（不要每個工具呼叫都 narrate）

---

## 10. 提交（git commit）規範

- Phase 0a 起每次邏輯完整的功能變動都 commit
- 訊息格式：英文摘要 + 中文細節（用 HEREDOC）
- Co-Authored-By 帶上 Claude
- 沒有使用者明確要求**絕不 push**
- 永遠用 `pnpm typecheck` 通過後才 commit

---

## 11. 緊急狀況

- **typecheck 失敗**：絕不 commit，立即修
- **頁面顯示空白 / 紅錯**：先看 console_logs，再回頭看最後一個 edit
- **使用者抱怨「之前可以，現在不行」**：先用 `git log --oneline` + `git diff` 對比，找到 regression 點
- **找不到檔案 / 路徑解析失敗**：用 `Bash find` 確認位置，不要憑記憶引用路徑
- **新增 npm 套件**：先確認 [`plan.md`](./plan.md) 有列；沒列的話先問使用者要不要加

---

## 12. 不要碰的東西

- `node_modules/`、`.next/`、`pnpm-lock.yaml` 不手動編輯
- `package.json` 改動只透過 `pnpm add/remove`，不直接改 dependencies
- 設計系統 token（`tailwind.config.ts` 的 colors / fontSize / borderRadius）— 任何改動都要更新 [`plan.md`](./plan.md) §11 與 [`README.md`](./README.md) 的設計系統段落
- `參考檔案/` — 唯讀，這是設計規範來源
- `.claude/launch.json` — 已配好 dev server 啟動方式

---

> 簡而言之：**讀 plan.md → 確認當前 Phase → 用 Cal.com tokens → 編輯 → typecheck → 視覺驗證 → 更新文件 → commit。**
