#!/bin/bash
# 旅遊規劃Z — 強制停止
# 雙擊此檔 → 關閉所有佔用 port 3000 的 process

set -u

clear
echo "──────────────────────────────────────────"
echo "  🛑 停止旅遊規劃Z"
echo "──────────────────────────────────────────"

PIDS=$(lsof -ti :3000 -sTCP:LISTEN 2>/dev/null || true)
if [ -z "$PIDS" ]; then
  echo "  ℹ️  沒有正在執行的伺服器（port 3000 是空的）"
else
  echo "  發現執行中的伺服器 (PID: $PIDS)"
  echo "  正在關閉..."
  echo "$PIDS" | xargs -I {} kill -9 {} 2>/dev/null || true
  sleep 0.5
  if lsof -i :3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "  ⚠️  仍未完全關閉，請手動處理"
  else
    echo "  ✅ 已關閉"
  fi
fi

echo ""
read -r -p "按 Enter 關閉此視窗..." _
