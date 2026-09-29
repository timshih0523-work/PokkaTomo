# AGENTS.md — 給 AI 協作者的入門

> 接手這個專案前先讀完這一頁（約 5 分鐘）。細節：[`README_TECH.md`](./README_TECH.md)（現況規格）、
> [`CHANGELOG.md`](./CHANGELOG.md)（歷史與踩過的坑）、[`README.md`](./README.md)（使用者說明）。
> **如果專案裡有 `AGENTS.local.md`／`CHANGELOG.local.md`，一定要一起讀**：那是開發者電腦上才有、不上傳 Git 的私人背景
> （真實使用情境、部署位置、資料的歷史）。那裡的內容**不可以寫進任何會上傳的檔案**。

## 這是什麼

**PokkaTomo（ポッカとも）**：靈感來自 SHARP ポケとも 的**網頁版原創** AI 陪伴角色（名稱、造型都是原創，不要用原產品的名字）：Node/Express 後端＋Vue 3/Vite 前端，
AI 用 macOS 內建的 **Apple Foundation Models**（指令列 `fm`），完全在本機、不連雲端 LLM。

## 最重要的限制

1. **使用者不懂技術**（日文母語的一般使用者）。只會雙擊 `start-pokkatomo.command`／`stop-pokkatomo.command`（`autostart-on/off.command` 設定登入時自動打開）。
   任何需要打指令、開終端機、改 JSON 的解法都不行；錯誤要在畫面上用使用者看得懂的話說明。
2. **不能弄壞使用者的資料**：`server/data/`（`app/` 密碼與角色清單、`characters/<編號>/` 每個角色的設定／對話／日記、`backups/`、`logs/`）是使用者的資料。開發、測試、同步都不可以覆蓋或刪除。結構見 README_TECH 4.10。
   測試一律用 `POKKATOMO_DATA_DIR` 指到暫存資料夾（`tests/helpers/env.js`）。
3. **主要伺服器一律只聽 127.0.0.1**，不要改成 0.0.0.0。手機／平板連線是使用者自己在設定裡打開時，`lanService.js` 另外開的 port（有 `lanGuard` 檢查），不要用其他方式對外開放。
4. **介面雙語**：繁體中文＋日文，兩份字典結構要一致；提到角色名字寫 `{name}`，不要寫死「PokkaTomo」。
5. **Apple Foundation Models 只有約 4096 tokens**：prompt 各段都有字數上限（`config.js` 的 `PROMPT_*`）。加東西進 prompt 前先想預算。
6. **角色名字可以改**：人設、日記、歷史標籤都不能寫死名字（日記完全不提名字）。
7. **零額外測試依賴**：測試用 Node 內建 `node --test`；Node 20 以上。

## 開發者（專案擁有者）的偏好

- 用**繁體中文**溝通，程式註解與文件也用繁體中文。
- 發現問題就**直接修**，不要只寫進文件。修完要跑測試、要驗證。
- 大方向的新功能（例如 RAG）先提方案等他決定，不要自己動工。

## 怎麼跑

```bash
npm install
npm test            # 約 210 個測試，全部要過
npm start           # http://localhost:3000（沒有真的 fm 時用 FM_BIN 指到假的，參考 tests/helpers/fakeFm.cjs）
npm run dev         # 前端熱更新（另外要開 npm start）
npm run build       # 前端 → server/public
npm run bundle      # 打包 zip 給新電腦
```

## 程式慣例

- **設定**：所有常數與環境變數在 `server/config.js`，其他檔案不要直接讀 `process.env`。
- **字數上限**只在 `config.js` 的 `LIMITS`；前端從 `GET /api/config` 拿（`web/src/limits.js`），**前端不要寫數字**。
- **紀錄**：用 `lib/logger.js` 的 `log.info/warn/error(事件名, {欄位})`，不要用 `console.warn`；**不要記對話內容**。
  前端錯誤用 `web/src/clientLog.js` 的 `reportClient()`。
- **資料結構**：每個角色一個資料夾 `characters/<編號>/`（character.json、user.json、state.json、diary.json、conversations/），共用的在 `app/`。
  檔案裡的時間一律用 `toLocalIso()` 存成人看得懂的字串，讀出來用 `parseTime()`。對話只存在 conversations/（不要再加一份「最近對話」的檔案）。
- **多角色**：每個角色的資料依 `lib/characterContext.js` 的 `charPaths()` 決定位置（AsyncLocalStorage 帶著目前角色）。
  新增讀寫角色資料的程式：**路徑一定要用 `charPaths()` 算，不要寫死 `DATA_DIR/xxx.json`**；模組層級的快取要依 `currentCharacterId()` 分開；
  不在請求裡的背景工作要用 `withCharacter(id, fn)` 包。設定面板的所有設定和語言也都跟著角色走（各角色資料夾的 `user.json`／`character.json`），不要做成全部角色共用。
  語言分兩個：`language`（角色說話的語言，建立後不能改，後端擋）與 `uiLanguage`（介面顯示，可切換）。語音、回覆相關的一律用說話的語言。
  **新增角色只給預設值**（`freshProfile`：稱呼主人、預設個性、其他空白），不要從別的角色複製任何設定。
  **程式不自動建立角色**（開發者要求）：沒有角色時清單是空的，需要目前角色的 API 回 409 `no_character`，前端打開新增表單。
  測試的 `setupTestEnv()` 會先放一個預設角色 001；要測「沒有角色」就刪掉資料夾，`env.resetData()` 是清空後放回 001。
- **密碼**：新的 API 預設在 `requireUnlock` 後面（`routes/index.js`），只有真的不能擋的才放前面。
  前端的 fetch 會由 `web/src/api.js` 自動帶 token／角色；要下載檔案用 `downloadFrom()`，不要用 `<a href="/api/...">`。
- **對話一律經過 `historyService.appendMessages()`**：寫進角色的 `conversations/YYYY-MM.jsonl`（唯一一份），
  RAG 索引也靠它的通知增量更新。不要另外直接寫對話檔。
- **路由**：每個資源一個 `server/routes/*.js`，一律用 `asyncHandler` 包；錯誤丟 `lib/errors.js` 的 AppError 子類別，
  由 `errorHandler` 回 `{ error: <代碼>, message }`。前端只依 `error` 代碼顯示翻譯文字。新代碼要在前端 `localizeChatError` 補。
- **資料檔**：讀用 `readJson`（壞檔自動備份）、寫用 `writeJsonAtomic`，讀-改-寫整段放進 `enqueue(path, fn)`。
  改 profile 用 `updateProfile(mutator)`，不要讀出來再整份存回去。新欄位要有預設值、舊檔案要能讀。
- **模型呼叫**：只在 `fmService.js`。背景工作（記憶提取、日記）走 `runBackgroundFm`；聊天不排隊。
  模型輸出一律假設可能格式錯誤（情緒標籤解析失敗 → calm；JSON 解析失敗 → 忽略）。
- **前後端共用清單**要一致（有測試）：情緒 `lib/mood.js` ↔ `web/src/moods.js`；觸摸部位
  `companionService.TOUCH_PARTS` ↔ `web/src/avatarParts.js`；字數上限（前端 maxlength ↔ 後端）。
- **角色**：`App.vue` 只透過 `AvatarAdapter` 的 props（status/mood/quirk/outfit/label）與事件（touch/hover `{part, side}`）
  跟角色溝通。換全身／3D 角色只換 `AvatarAdapter` 底下的元件。
- **前端 composable** 要能在元件外使用（lifecycle hook 用 `getCurrentInstance()` 保護），才能寫測試。
- 新功能要有測試：純函式放 `tests/lib/`、service 放 `tests/*Service.test.js`、API 放 `tests/api*.test.js`
  （用 `createApp()`＋假 fm），前端邏輯放 `tests/web/`。畫面改動用 Playwright 一次性腳本檢查（不進 `npm test`）。

## 地雷（詳見 CHANGELOG「踩過的坑」）

- 跑測試時 `config.js` 會自動把沒指定的 DATA_DIR 換成暫存資料夾（以前會寫到真正的 logs）；新測試還是要用 `setupTestEnv()`。
- 使用者的喜好／紀念日**不要每句都放進 prompt**（Apple 小模型會每句都講），用 `lib/relevance.js` 只放相關的。
- 不要用 `ps aux | grep …server.js | xargs kill` 在同一個 bash 裡殺伺服器：指令本身含那段字，會把自己殺掉（exit 144）；用 `pkill -f '^node server/server.js'`。
- **寫檔前的 mkdir -p 會在舊路徑長出資料夾**：專案資料夾改名時還在跑的舊伺服器記著舊的絕對路徑，被新啟動檔關掉時寫了一行 `server_stop`，
  就在原地長出只有 `server/data/logs` 的舊名資料夾。現在所有寫入都先檢查 `lib/dataHome.js`（`server/` 不在就不寫、舊伺服器自己結束）；新增寫檔的地方也要用 `assertDataHome()`。
- 跑會搬檔案的腳本（例如 `migrate-v2.js`）**不要接 `| head`**：head 讀夠就關掉管線，腳本會在搬到一半時被 SIGPIPE 砍掉。輸出先寫到檔案再看。
- 在時區不是本地的環境（例如 UTC 的 VM）跑會寫時間的腳本，要加 `TZ=<使用者的時區>`，不然時間會存成 +00:00。
- 角色的回覆**不要**拿去當成使用者的事實（記憶擷取只看使用者的話）；也不要讓角色說自己是 AI（`identityRulesLine`）。
  **介面文字也不要出現「AI」**（`tests/web/outfits.test.js` 會檢查 i18n 兩份字典）。
- **重要的資料操作要再輸入一次密碼**（`verifyPin`）：刪除角色是真的刪（連每日備份裡的也刪）；匯入備份前先把現在的資料搬到 `backups/before-import-*/`（`dataAdminService.js`）。整批換掉資料檔之後要 `resetCaches()`（`lib/cacheRegistry.js`）；新加記憶體快取的模組要在那裡註冊清除函式。
- 登入時自動啟動用「登入項目＋.command」，**不要改成 LaunchAgent**：專案在「文件」資料夾，背景服務讀不到（macOS 隱私保護）。
- 測試資料夾是 `tests/` 不是 `test/`（node 會把 `test/` 下每個 JS 當測試）。
- `tests/helpers/env.js` 必須在 import `server/` 前呼叫（config 載入時就讀環境變數）。
- 測 Host 檢查要用 `http.request`（fetch 會忽略 Host 標頭）。
- 不要用 `pkill -f`（會殺到自己，exit 144）；關伺服器用 `scripts/stop-server.sh`，或 `ps | grep [s]erver/server.js` 取 PID。
- 不要用 JS 內建的 Intl 農曆（ICU 在 2027、2030 春節差一天）；農曆用 `lib/lunarData.js`（`scripts/gen-lunar.py` 產生）。
- macOS 上查 App 有沒有裝不要用 `osascript 'id of application "X"'`：沒裝會跳「找不到應用程式」的視窗。
- 畫面上「跳出來」的東西（泡泡、彈窗、面板）一律絕對定位在上層，**不要放進會改變版面高度的位置**，不然角色會被推動。
- SVG 動畫：`.fb-avatar g` 預設 `transform-box: view-box`，個別要 fill-box 的選擇器要寫得比它具體（CSS 權重）。
- `fm` CLI 的參數格式**沒在真機驗證過**；Open-Meteo 也沒在真網路驗證過。

## 更新到使用者的電腦

實際的位置與流程細節在 `AGENTS.local.md`（不上傳）。原則：

1. 只傳改過的程式／文件檔，**不要碰 `server/data/`**，也不用傳 `server/public`、`node_modules`（啟動檔會自己重建／安裝）。
2. 傳完比對雙方 md5。
3. `chmod 755 *.command scripts/stop-server.sh`（同步工具會拿掉執行權限）。
4. 在 Mac 上跑 `npm test` 確認。
5. Mac 離線時改給 zip（`npm run bundle`）。

## 目前的狀態與待決定事項

- 功能都已完成並同步（見 README_TECH「角色能做的事」）。
- 已完成：四位數密碼鎖＋閒置 15 分鐘上鎖、多角色（每個角色獨立）、文字對話預設隱藏＋漫畫對話泡泡、占卜彈窗、占卜按鈕在天氣旁、
  日記月曆的「日記／對話」頁籤、每小時天氣、進畫面不顯示舊對話、永久對話封存（JSONL）、每日自動備份、匯出 zip、紀錄檔、輕量 RAG（BM25）、全身 SVG 角色（可切回舊版）、
  啟動檔優先開 Chrome、字數上限單一來源、農曆資料到 2099、說話語言／介面語言分開、刪除角色、匯入備份、登入時自動打開、
  「記得的事」彈窗（搜尋＋改／刪記憶）、吃東西／跳舞／睡帽／衣櫥（換季服裝＝自動）、手機 HTTPS＋語音輸入。
- 可能的下一步：提醒／鬧鐘（先不做）。同一個角色只用一種語言，不需要中日文互找。
- 忘記密碼：刪 `server/data/app/security.json`。
- **Git 不上傳**：`server/data/`（使用者資料）、`*.local.md`（私人背景）、`.env`、`Claude outputs/`、`server/native/build/`，見 `.gitignore`。不用 GitHub Actions（`.github/workflows/` 也在 `.gitignore`）：上傳前自己跑 `npm test`。
- 手機／平板：家裡 Wi‑Fi、HTTPS（自己發的憑證，每台手機裝一次）、按住說話＝手機錄音→Mac 辨識（`speechService.js`＋`native/speech.swift`）。
  `speech.swift` 在 Linux 開發環境沒辦法編譯或執行，改它之後一定要在 Mac 上實測；改了會重新編譯、Mac 要重新允許語音辨識。
- 授權：AGPL-3.0-or-later，原作者 timshih0523-work（`LICENSE`、README「授權」、設定面板最下面的原始碼連結；AGPL 要求網路服務也要提供原始碼，不要拿掉）。
- 其他限制見 README_TECH 第 9 節。
