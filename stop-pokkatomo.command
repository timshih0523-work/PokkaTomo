#!/bin/bash
# stop-pokkatomo.command
# 雙擊就能完全關閉 PokkaTomo，不用打開「活動監視器」找 node。
# 實際的關閉邏輯跟 start-pokkatomo.command 共用 scripts/stop-server.sh。

cd "$(dirname "$0")" || exit 1

PORT="$(node -e "import('./server/config.js').then((c) => process.stdout.write(String(c.PORT)))" 2>/dev/null)"
if [ -z "$PORT" ]; then
  PORT=3000
fi

bash scripts/stop-server.sh "$PORT"
if [ $? -eq 2 ]; then
  echo "Port $PORT 上跑的不是 PokkaTomo，沒有動它。"
else
  echo "🐵 PokkaTomo 已經關閉了，晚安～"
fi
sleep 2
