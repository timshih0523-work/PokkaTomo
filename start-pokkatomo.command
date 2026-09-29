#!/bin/bash
# start-pokkatomo.command
# 給非技術使用者的「一鍵啟動」檔案：在 Finder 裡雙擊這個檔案就會：
#   1. 切到這個檔案所在的資料夾
#   2. 檢查 Node.js 有沒有安裝
#   3. 第一次執行、或程式更新過之後，自動安裝套件、重新編譯前端
#   4. 如果偵測到舊版本的 PokkaTomo 還在執行中，自動關掉它（不用自己去活動監視器找）
#   5. 啟動（新的）後端伺服器
#   6. 等伺服器真的準備好，才打開瀏覽器到 http://localhost:PORT（PORT 預設 3000，見 server/config.js）；
#      啟動失敗的話跳出提示並顯示紀錄，不會打開一個壞掉的頁面
#
# 如果雙擊沒反應，可能是 macOS 沒給執行權限，
# 在「終端機」App 裡輸入： chmod +x 這個檔案的路徑，再雙擊一次即可。

cd "$(dirname "$0")" || exit 1

LOG_FILE="pokkatomo.log"

echo "🐵 正在啟動 PokkaTomo，請稍等..."

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "找不到 Node.js" message "請先到 nodejs.org 下載安裝 Node.js（選 LTS 版本即可），安裝完成後再重新雙擊這個檔案。" buttons {"好"} default button 1' >/dev/null 2>&1
  echo "找不到 node，請先安裝 Node.js：https://nodejs.org/"
  read -n 1 -s -r -p "按任意鍵關閉這個視窗..."
  exit 1
fi

# PORT 不在這裡寫死：直接問 server/config.js 真正會用的值（它會自己看
# process.env.PORT，這個 node 子行程也會繼承同一份環境變數，所以行為完全一致）。
# 這樣「PORT 的預設值」只有 server/config.js 這一個地方需要維護，不用三個地方一起改。
PORT="$(node -e "import('./server/config.js').then((c) => process.stdout.write(String(c.PORT)))" 2>/dev/null)"
if [ -z "$PORT" ]; then
  PORT=3000 # 保底：萬一 config.js 讀取失敗（例如檔案被搬走了），還是要有個值可以用
fi

# 套件：第一次（沒有 node_modules）或 package.json 有更新過（比上次安裝的紀錄新）時才重新安裝。
if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then
  echo "安裝需要的套件中（只有第一次或更新後需要，可能要一兩分鐘）..."
  npm install
  if [ $? -ne 0 ]; then
    if [ -d node_modules ]; then
      # 已經裝過一次了（只是程式更新時 package.json 有改，例如多了測試指令）：
      # 這時候如果剛好沒網路，不要因為這樣整個打不開，先用現有的套件繼續啟動。
      echo "（更新套件失敗，可能沒有網路；先用已經裝好的套件繼續啟動）"
    else
      osascript -e 'display alert "安裝失敗" message "npm install 失敗了，請確認網路連線，或把終端機的錯誤訊息截圖給開發者看。" buttons {"好"} default button 1' >/dev/null 2>&1
      read -n 1 -s -r -p "按任意鍵關閉這個視窗..."
      exit 1
    fi
  fi
fi

# 畫面（前端）：沒編譯過，或 web/ 底下有任何檔案比上次編譯結果新（代表程式更新過），就重新編譯。
# 以前只看「server/public 是不是空的」，更新程式後如果沒人手動刪掉 server/public，
# 就會一直跑舊的畫面——之前「泡泡位置修好了卻看起來一樣」就跟這類「新舊版本混在一起」有關。
NEEDS_BUILD=0
if [ ! -f server/public/index.html ]; then
  NEEDS_BUILD=1
elif [ -n "$(find web vite.config.js package.json -newer server/public/index.html -type f 2>/dev/null | head -n 1)" ]; then
  NEEDS_BUILD=1
fi
if [ "$NEEDS_BUILD" = "1" ]; then
  echo "準備畫面中（第一次或更新後需要，幾秒鐘）..."
  npm run build
  if [ $? -ne 0 ]; then
    osascript -e 'display alert "準備失敗" message "前端編譯失敗了，請把終端機的錯誤訊息截圖給開發者看。" buttons {"好"} default button 1' >/dev/null 2>&1
    read -n 1 -s -r -p "按任意鍵關閉這個視窗..."
    exit 1
  fi
fi

# 每次雙擊都把舊的 PokkaTomo 關掉、重新啟動一個新的，不要沿用舊的還在跑的那個——
# 這是給不熟電腦的人用的一鍵啟動檔，不可以要求她自己去「活動監視器」找 node 結束程序。
# 實際的關閉邏輯在 scripts/stop-server.sh（跟 stop-pokkatomo.command 共用），
# 只會關掉「確定是這個專案的 server/server.js」的行程，不會誤殺其他程式。
bash scripts/stop-server.sh "$PORT"
if [ $? -eq 2 ]; then
  osascript -e "display alert \"Port $PORT 被其他程式佔用\" message \"這個 port 被別的程式用掉了（不是 PokkaTomo 自己），沒辦法自動關閉、也沒辦法啟動。請把終端機的錯誤訊息截圖給開發者看。\" buttons {\"好\"} default button 1" >/dev/null 2>&1
  echo "Port $PORT 被其他不相干的程式佔用，無法自動啟動。"
  read -n 1 -s -r -p "按任意鍵關閉這個視窗..."
  exit 1
fi

echo "啟動中..."
# POKKATOMO_OPEN_BROWSER=0：瀏覽器由這個檔案負責開（下面確認伺服器真的準備好之後），
# server.js 自己就不要再開一次，不然每次雙擊都會跑出兩個一模一樣的分頁。
POKKATOMO_OPEN_BROWSER=0 nohup node server/server.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
disown

# 以前是固定 sleep 2 秒就開瀏覽器：電腦比較慢時會打開一個「無法連線」的頁面；
# 伺服器如果根本啟動失敗，也是照樣開一個壞掉的頁面，使用者完全不知道發生什麼事。
# 現在改成每 0.5 秒問一次 /api/health，準備好就馬上開；最多等 15 秒。
READY=0
for i in $(seq 1 30); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break # 行程已經死掉了，不用再等
  fi
  # 用 127.0.0.1：伺服器只聽 IPv4 的這台電腦（server/config.js 的 HOST）。瀏覽器還是開 localhost，
  # 這樣 localStorage 裡的偏好（靜音等）跟以前是同一個網址、不會不見。
  if curl -s -o /dev/null -m 1 "http://127.0.0.1:$PORT/api/health"; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" != "1" ]; then
  echo ""
  echo "PokkaTomo 沒有成功啟動，以下是最後幾行紀錄："
  tail -n 15 "$LOG_FILE"
  osascript -e 'display alert "PokkaTomo 沒有成功啟動" message "請把這個終端機視窗截圖給開發者看。" buttons {"好"} default button 1' >/dev/null 2>&1
  read -n 1 -s -r -p "按任意鍵關閉這個視窗..."
  exit 1
fi

# 優先用 Google Chrome 開：語音辨識（按住說話）在 Chrome 最穩，Safari 常常不能用麥克風輸入。
# 沒裝 Chrome 才用系統預設的瀏覽器（通常是 Safari）。
# 先看兩個常見的安裝位置；不在那裡的話用 Spotlight（mdfind）找。
# 不要用 osascript 'id of application ...'：沒裝的時候 macOS 會跳出「Google Chrome 在哪裡？」的視窗。
URL="http://localhost:$PORT"
has_chrome() {
  [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ] ||
    [ -n "$(mdfind "kMDItemCFBundleIdentifier == 'com.google.Chrome'" 2>/dev/null | head -n 1)" ]
}
if has_chrome; then
  open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
else
  echo "（沒有找到 Google Chrome，改用預設的瀏覽器開。建議安裝 Chrome，語音輸入會比較穩定。）"
  open "$URL"
fi

echo ""
echo "PokkaTomo 已經打開在瀏覽器裡了！這個視窗可以直接關掉沒關係。"
echo "（每次雙擊這個檔案都會自動關掉舊的、換成新的；想完全關掉就雙擊 stop-pokkatomo.command）"
sleep 2
