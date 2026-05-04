# 部署指南（Vercel + Neon Postgres）

## 一次性設定

### 1. Neon — 建立資料庫

1. 到 [neon.tech](https://neon.tech) 註冊
2. Create project：region 選 **AWS Asia Pacific (Singapore)** 或 **Tokyo**（亞洲使用者延遲較低）
3. 拿 connection string（postgresql://...?sslmode=require）— 之後 Vercel 會用

### 2. Vercel — Import 專案

1. [vercel.com](https://vercel.com) → New Project → Import Git Repository → 選 `Travel-Planer`
2. Framework preset 自動偵測為 Next.js
3. Settings → Functions → Region：選跟 Neon 同一區
4. Environment Variables 加：

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `APP_ENC_KEY` | `openssl rand -base64 32` 的輸出 |
| `NEXT_PUBLIC_GOOGLE_MAPS_JS_KEY` | 你的 Google Maps JS key |
| `GOOGLE_MAPS_SERVER_KEY` | 你的伺服器版 key（可同一把） |

5. Deploy

build 階段會自動跑 `prisma generate && prisma migrate deploy && next build`，第一次 deploy 時 migrate deploy 會把 schema 建到空 Neon DB 裡。

### 3. 之後

- `git push origin main` → Vercel 自動 deploy
- `Settings` 頁面內的 LLM provider / Google Maps key / Mapbox / AviationStack 等都存在 DB 裡（加密），不用再設環境變數

## 本地開發切回 SQLite？

不用切回。本地直接用 Neon dev branch（Neon 免費方案有 main + dev 兩條 branch）：
- `neon branches create --name dev`
- 拿 dev branch 的 connection string 寫進本地 `.env`
- `pnpm prisma migrate dev` 在本地跑遷移、`pnpm dev` 啟動

或者本地裝 Postgres：`brew install postgresql@17 && brew services start postgresql@17 && createdb travel_planner_dev`，把 `DATABASE_URL=postgresql://localhost/travel_planner_dev` 寫進 `.env`。

## 加新欄位 / 變更 schema

1. 改 `prisma/schema.prisma`
2. 本地 `pnpm prisma migrate dev --name <change_summary>`
3. commit + push
4. Vercel build 自動跑 `migrate deploy` 套用到正式 DB

## 故障排除

| 症狀 | 解法 |
|---|---|
| Vercel build「Migration failed」 | 看 build log 找具體 SQL 錯誤；通常是 schema 跟現有資料衝突 |
| Vercel function 連 Neon timeout | 確認 Vercel Function Region 跟 Neon Region 同一區，避免跨洲延遲 |
| `Can't reach database server` | Neon free tier 閒置 5 分鐘會 suspend；第一個請求會冷啟動，給 ~5 秒 |
| 想看 prod DB 資料 | Neon dashboard → Tables，或本地 `DATABASE_URL=<neon-url> pnpm prisma studio` |
