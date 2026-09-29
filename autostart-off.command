#!/bin/bash
# autostart-off.command
# 雙擊一次：取消「登入時自動打開 PokkaTomo」（把 start-pokkatomo.command 從 macOS 的登入項目移除）。
# 不會關掉現在正在跑的 PokkaTomo；要關掉請雙擊 stop-pokkatomo.command。

cd "$(dirname "$0")" || exit 1
TARGET="$(pwd)/start-pokkatomo.command"

osascript <<OSA >/dev/null 2>&1
tell application "System Events"
  repeat with li in (every login item whose path is "$TARGET")
    delete li
  end repeat
  if exists login item "PokkaTomo" then delete login item "PokkaTomo"
end tell
OSA
osascript -e 'display dialog "已經取消了，以後登入時不會自動打開 PokkaTomo。" buttons {"好"} default button 1 with title "PokkaTomo"' >/dev/null 2>&1
echo "已取消登入時自動啟動。"
sleep 2
