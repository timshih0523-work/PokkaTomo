#!/bin/bash
# scripts/stop-server.sh <PORT>
# start-pokkatomo.command（重啟前）跟 stop-pokkatomo.command（單純關閉）共用的「關掉 PokkaTomo」邏輯，
# 只維護這一份。用 `bash scripts/stop-server.sh 3000` 呼叫，不需要執行權限。
#
# 回傳值：
#   0 = 本來就沒在跑，或已經成功關掉
#   2 = 這個 port 被「不是 PokkaTomo」的程式佔用，沒有動它（避免誤殺不相干的程式）

PORT="${1:-3000}"

EXISTING_PID="$(lsof -i tcp:$PORT -sTCP:LISTEN -t 2>/dev/null | head -n 1)"
if [ -z "$EXISTING_PID" ]; then
  exit 0
fi

EXISTING_CMD="$(ps -p "$EXISTING_PID" -o command= 2>/dev/null)"
if ! echo "$EXISTING_CMD" | grep -q "server/server.js"; then
  exit 2
fi

# 先送 SIGTERM：server.js 收到後會等正在寫的聊天紀錄/設定檔寫完再結束（graceful shutdown）。
# 最多等 2 秒，還沒結束才 kill -9，不要卡住後面的流程。
kill "$EXISTING_PID" 2>/dev/null
for i in 1 2 3 4; do
  kill -0 "$EXISTING_PID" 2>/dev/null || exit 0
  sleep 0.5
done
kill -9 "$EXISTING_PID" 2>/dev/null
exit 0
