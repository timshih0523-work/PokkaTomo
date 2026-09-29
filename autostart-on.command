#!/bin/bash
# autostart-on.command
# 雙擊一次：以後登入這台 Mac 時自動打開 PokkaTomo（啟動伺服器，然後用 Chrome 打開頁面）。
#
# 做法：把 start-pokkatomo.command 加進 macOS 的「登入項目」
# （系統設定 → 一般 → 登入項目 也看得到，也可以在那裡移除）。
# 不用 LaunchAgent：專案放在「文件」資料夾，macOS 不讓背景服務直接讀「文件」裡的檔案（Operation not permitted）；
# 登入項目打開 .command 是透過「終端機」執行，跟平常雙擊一樣有權限。hidden:true = 終端機視窗不會跳到前面。
#
# 第一次執行時 macOS 可能會問「終端機想要控制 System Events」，按「好」。
# 想取消：雙擊 autostart-off.command。

cd "$(dirname "$0")" || exit 1
TARGET="$(pwd)/start-pokkatomo.command"
chmod +x "$TARGET" 2>/dev/null

if osascript <<OSA
tell application "System Events"
  repeat with li in (every login item whose path is "$TARGET")
    delete li
  end repeat
  make login item at end with properties {name:"PokkaTomo", path:"$TARGET", hidden:true}
end tell
OSA
then
  osascript -e 'display dialog "設定好了！以後登入這台 Mac 時，PokkaTomo 會自動打開。

想取消的話，雙擊 autostart-off.command。" buttons {"好"} default button 1 with title "PokkaTomo"' >/dev/null 2>&1
  echo "✅ 已設定登入時自動啟動 PokkaTomo。"
else
  osascript -e 'display alert "設定失敗" message "可能是沒有允許「終端機」控制 System Events。請到 系統設定 → 隱私權與安全性 → 自動化，允許「終端機」控制「System Events」後再雙擊一次。" buttons {"好"} default button 1' >/dev/null 2>&1
  echo "設定失敗：請允許終端機控制 System Events 後再試一次。"
fi
sleep 2
