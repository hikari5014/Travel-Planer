#!/bin/bash
# 旅遊規劃工具 — 一鍵啟動
# 雙擊此檔案 → 自動啟動 dev server + 開啟瀏覽器
# 視窗中按 Ctrl+C 即可停止伺服器

set -u

# ───────────────────────────────────────────────────────────────
# 切到此腳本所在目錄（即使路徑含中文/空白也 OK）
# ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR" || exit 1

clear
echo "──────────────────────────────────────────"
echo "  🗺️  旅遊規劃工具 (Travel Planner)"
echo "──────────────────────────────────────────"
echo "  目錄: $SCRIPT_DIR"
echo ""

# ───────────────────────────────────────────────────────────────
# 確保 pnpm / node 在 PATH 上（macOS 圖形環境的子 shell 不會自動 source）
# ───────────────────────────────────────────────────────────────
if [ -f "$HOME/.zshrc" ]; then
  # shellcheck disable=SC1090
  source "$HOME/.zshrc" 2>/dev/null || true
fi
if [ -f "$HOME/.bash_profile" ]; then
  # shellcheck disable=SC1090
  source "$HOME/.bash_profile" 2>/dev/null || true
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:$PATH"

# 確認 pnpm 存在
if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ 找不到 pnpm 指令。"
  echo ""
  echo "   請先安裝 Node.js + pnpm："
  echo "   1. 從 https://nodejs.org 安裝 Node.js"
  echo "   2. 在終端機執行：npm install -g pnpm"
  echo ""
  read -r -p "按 Enter 關閉視窗..." _
  exit 1
fi

PNPM_VER="$(pnpm -v 2>/dev/null || echo '?')"
NODE_VER="$(node -v 2>/dev/null || echo '?')"
echo "  Node $NODE_VER · pnpm $PNPM_VER"
echo ""

# ───────────────────────────────────────────────────────────────
# 若 port 3000 被佔用，自動清掉舊的 dev server
# ───────────────────────────────────────────────────────────────
if lsof -i :3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠️  Port 3000 已被佔用 — 自動關閉舊服務..."
  lsof -ti :3000 -sTCP:LISTEN | xargs -I {} kill -9 {} 2>/dev/null || true
  sleep 1
fi

# ───────────────────────────────────────────────────────────────
# 安裝相依套件（首次或 lockfile 變更時）
# ───────────────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦 第一次啟動 — 安裝相依套件中（約 1 分鐘）..."
  pnpm install || { echo "❌ pnpm install 失敗"; read -r -p "按 Enter..." _; exit 1; }
  echo ""
fi

# ───────────────────────────────────────────────────────────────
# 確保 Prisma client 存在（避免首次跑時報錯）
# ───────────────────────────────────────────────────────────────
if [ ! -d "node_modules/.pnpm" ] || [ ! -f "prisma/dev.db" ]; then
  echo "🗄️  初始化資料庫..."
  pnpm prisma migrate deploy 2>/dev/null || pnpm prisma migrate dev --name init 2>/dev/null || true
  echo ""
fi

echo "🚀 啟動開發伺服器於 http://localhost:3000"
echo "   （瀏覽器會在伺服器就緒後自動開啟）"
echo ""
echo "   按 Ctrl+C 可隨時停止。"
echo "──────────────────────────────────────────"
echo ""

# ───────────────────────────────────────────────────────────────
# 背景：等 server 起來再打開瀏覽器
# ───────────────────────────────────────────────────────────────
(
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null http://localhost:3000; then
      open "http://localhost:3000"
      exit 0
    fi
    sleep 0.5
  done
) &

# 前景：跑 dev server。Ctrl+C 直接收到信號乾淨關閉。
pnpm dev

echo ""
echo "──────────────────────────────────────────"
echo "  👋 伺服器已停止。"
echo "──────────────────────────────────────────"
read -r -p "按 Enter 關閉此視窗..." _
