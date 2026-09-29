# PokkaTomo（Apple 版）— 技術文件

這份文件描述**程式目前的樣子**：架構、API、資料格式、prompt 組法、前端運作、部署與測試。

- 第一次接手（人或 AI）：先讀 [`AGENTS.md`](./AGENTS.md)，一頁看完限制、慣例、地雷。
- 為什麼會長這樣、以前踩過哪些坑：看 [`CHANGELOG.md`](./CHANGELOG.md)。
- 給使用者看的操作說明：[`README.md`](./README.md)。

程式碼註解、文件都是繁體中文；介面文字有繁體中文、日文兩套。

---

## 1. 產品概要與限制

一個跑在瀏覽器裡的 AI 陪伴角色 **PokkaTomo**（日文 ポッカとも）。靈感來自市面上的口袋型對話機器人（例如 SHARP ポケとも）。
這個專案做的是**網頁版的原創角色**，名字、造型都是原創，不使用 SHARP 的名稱與角色設計。預設名字 PokkaTomo（日文介面 ポッカとも），可以改。

| 項目 | 內容 |
|---|---|
| 使用者 | 一個人使用，日文或中文母語，**不懂技術**：只會雙擊啟動檔，不會開終端機、活動監視器 |
| 平台 | macOS（有 Apple Intelligence）＋ Chrome（語音辨識最穩）；Safari 可用但可能不能語音輸入 |
| AI 模型 | macOS 內建 **Apple Foundation Models**，透過指令列工具 `fm` 呼叫，完全在本機，沒有雲端 API、不用錢 |
| 語言 | 分兩種：角色**說話的語言**（回覆、語音、日記、稱呼、預設個性；建立角色時決定、不能改）和**介面顯示的語言**（隨時切換）。繁體中文／日文 |
| 隱私 | 所有資料存在本機 JSON 檔；伺服器只聽 127.0.0.1，同網路的其他裝置連不進來 |
| 手機 | 設定裡打開「手機／平板連線」後，同一個 Wi‑Fi 的 iPhone／iPad 可以用（HTTPS＋自己發的憑證；按住說話由 Mac 辨識，見 4.15） |

進入畫面：**四位數密碼**（第一次先設定）→ **選角色**（可以有好幾個角色，各自獨立）→ 開始聊天；閒置 15 分鐘自動上鎖。

角色能做的事：語音／打字聊天（文字對話預設隱藏，角色說的話以漫畫對話泡泡顯示）、情緒（胸口心情燈＋表情＋語調）、記得喜好與紀念日、每天寫日記（月曆檢視）、
想起很久以前聊過的事（輕量 RAG）、主動打招呼、生活儀式（早安／出門／回家／晚安，晚安後真的睡覺）、今日占卜、
台日節日裝飾、親密度成長、閒置小動作與夢話、全身角色＋分部位的觸摸反應、天氣、可改名字。
資料面：每則對話永久保存、每天自動備份、一鍵匯出 zip、紀錄檔（錯誤與事件）。

---

## 2. 系統總覽

```
┌──────────────────────── 瀏覽器（Vue 3 SPA）────────────────────────┐
│ App.vue：狀態、對話流程、各種計時器                                  │
│   AvatarAdapter ─ SvgAvatar（角色；status／mood／quirk／accessory；    │
│                  感應區回報 touch{part,side}）                        │
│   HoldToSpeakButton（Web Speech STT）  useVoice（TTS）                │
│   SettingsPanel / DiaryPanel（BaseDialog）  SeasonDecor / Particle     │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ fetch /api/*（同一個 origin、同一個 port）
┌──────────────────────────────▼─────────────────────────────────────┐
│ Express（server/app.js，只聽 127.0.0.1:3000）                       │
│  localOnly → json → static(server/public) → /api 路由 → JSON 404     │
│  → SPA fallback → errorHandler                                       │
│                                                                      │
│  routes/*  →  services：fm / profile / history / archive / rag /     │
│               diary / greet / companion / fortune / weather /        │
│               backup / export       lib/logger（紀錄檔）              │
└───────┬───────────────────────┬──────────────────────┬─────────────┘
        │ spawn                 │ fetch（選用）          │ 讀寫（原子寫入、排隊）
   `fm respond` CLI        Open-Meteo API          server/data/
 （Apple Foundation Models）（天氣、地名查詢）        app/、characters/<編號>/、
                                                    backups/、logs/
```

- 單一 port：前端 `vite build` 輸出到 `server/public`，由同一個 Express 伺服器送出。
- 沒有資料庫伺服器：每個角色一個資料夾（4 個 JSON 檔＋按月分檔的 JSONL 對話），見 4.10。
- 沒有登入：單一使用者，只接受本機連線。

---

## 3. 專案結構

```
pokkatomo_apple/
├─ AGENTS.md / CLAUDE.md       # 給 AI 協作者的入門（CLAUDE.md 只是指向 AGENTS.md）
├─ README.md                   # 使用者說明
├─ README_TECH.md              # 這份
├─ CHANGELOG.md                # 更新紀錄、踩過的坑
├─ start-pokkatomo.command      # 一鍵啟動（macOS 雙擊）
├─ stop-pokkatomo.command       # 一鍵關閉
├─ autostart-on.command        # 登入 Mac 時自動打開 PokkaTomo（加進 macOS 登入項目）
├─ autostart-off.command       # 取消上面那個
├─ LICENSE                     # AGPL-3.0（原作者 timshih0523-work）
├─ .github/workflows/test.yml  # 推上 GitHub 時自動跑 npm test＋build
├─ package.json                # scripts：dev / build / start / bundle / test / test:coverage
├─ vite.config.js              # 前端建置（輸出 server/public；dev proxy 指向 127.0.0.1:PORT）
├─ scripts/
│  ├─ bundle.js                # npm run bundle：打包 zip 給使用者（排除 node_modules、聊天資料、tests）
│  ├─ gen-lunar.py             # 產生 server/lib/lunarData.js（農曆節日 2024–2099）
│  ├─ migrate-v2.js            # 一次性：舊資料結構 → 新結構（2026-09 已在使用者的電腦上跑過）
│  └─ stop-server.sh           # 安全關閉伺服器（啟動檔、關閉檔共用）
├─ server/
│  ├─ server.js                # 啟動：listen、啟動時背景工作、開瀏覽器、優雅關閉
│  ├─ app.js                   # 組裝 Express app（測試直接用 createApp()）
│  ├─ config.js                # ★ 所有設定值與環境變數（其他檔案不直接讀 process.env）
│  ├─ fmService.js             # 呼叫 `fm`、可用狀態快取、prompt 組裝、背景佇列
│  ├─ profileService.js        # profile＝user.json（這個角色認識的你）＋character.json：讀、淨化、存、updateProfile
│  ├─ historyService.js        # 對話的讀寫入口（最近 N 則從對話檔讀）；關鍵記憶提取
│  ├─ archiveService.js        # ★ 對話資料庫 characters/<編號>/conversations/YYYY-MM.jsonl（唯一一份，只追加）
│  ├─ ragService.js            # 輕量 RAG：BM25 索引封存對話＋日記，聊天時找相關舊事
│  ├─ characterService.js      # 角色：character.json＋app/characters.json 清單（新增、改、刪、排序；不自動建立角色）
│  ├─ lockService.js           # 四位數密碼（scrypt）、session token、輸錯鎖定
│  ├─ backupService.js         # 每天第一次使用時自動備份 app/＋characters/ 到 backups/daily/（留 14 份）
│  ├─ exportService.js         # 匯出 zip（對話紀錄.txt、日記.txt、原始資料、紀錄檔）
│  ├─ dataAdminService.js      # 刪除角色（真的刪）、匯入備份（先把現在的資料搬到 backups/）
│  ├─ lanService.js            # 手機／平板連線：HTTPS（3001）＋第一次設定頁（HTTP 3002）
│  ├─ lanSetupApp.js           # 手機第一次設定頁：安裝憑證的步驟＋下載 CA
│  ├─ speechService.js         # 手機錄音 → Mac 語音辨識（native/speech.swift 自動編譯成 native/build/PokkaTomoSpeech.app）
│  ├─ diaryService.js          # 每個角色的 diary.json：寫日記、補寫、中期記憶
│  ├─ greetService.js          # 主動問候
│  ├─ companionService.js      # 每個角色的 state.json：親密度、睡覺、出門、觸摸統計、今天的占卜
│  ├─ fortuneService.js        # 今日占卜
│  ├─ weatherService.js        # 天氣、地名查詢（Open-Meteo）
│  ├─ lib/
│  │  ├─ characterContext.js   # ★ 資料夾結構（charPaths）＋目前是哪個角色（AsyncLocalStorage）
│  │  ├─ layoutV1.js           # 舊資料結構 → 新結構的轉換（scripts/migrate-v2.js、匯入舊 zip）
│  │  ├─ cacheRegistry.js      # 資料被整批換掉時清記憶體快取
│  │  ├─ asyncHandler.js       # async 路由的錯誤轉給 next（Express 4 必要）
│  │  ├─ asyncQueue.js         # 依 key 排隊執行（讀-改-寫不遺失）；drainAll
│  │  ├─ errors.js             # AppError / BadRequestError / FmUnavailableError / FmRespondError …
│  │  ├─ errorHandler.js       # 統一錯誤回應 { error, message }
│  │  ├─ jsonStore.js          # readJson（壞檔備份）/ writeJsonAtomic（暫存檔＋rename）
│  │  ├─ localOnly.js          # 只接受本機 Host（擋 DNS rebinding）
│  │  ├─ characterContext.js   # ★ 目前角色（AsyncLocalStorage）與各角色的資料位置
│  │  ├─ lockGuard.js          # 沒解鎖的請求回 401
│  │  ├─ logger.js             # 紀錄檔 logs/YYYY-MM-DD.log（一行一筆 JSON，不記對話內容）
│  │  ├─ textIndex.js          # tokenize（中日文 bigram、字形統一）＋ BM25 索引
│  │  ├─ zip.js                # 零依賴 zip 產生器（匯出用）
│  │  ├─ lunarData.js          # 農曆節日資料（產生的，不要手改）
│  │  ├─ mood.js               # 情緒清單、給模型的指示、[mood:xxx] 解析
│  │  ├─ rituals.js            # 早安／出門／回家／晚安判斷＋情境提示
│  │  ├─ seasons.js            # 台日節日（農曆日期讀 lunarData.js）
│  │  └─ time.js               # 本地日期、一天四時段、存檔用的時間格式（toLocalIso／parseTime）
│  ├─ routes/                  # 每個資源一個 Router，index.js 組合
│  │  └─ index / health / profile / history / chat / diary / greet / weather / companion / characters / memory / lock / system .js
│  ├─ data/                    # ★ 使用者資料（開發時不要覆蓋；測試用暫存資料夾）結構見 4.10
│  │  ├─ app/                  #   密碼、角色清單
│  │  ├─ characters/001/…      #   每個角色：character／user／state／diary.json、conversations/
│  │  ├─ backups/              #   daily/（每日）、deleted-characters/、before-import-*/、before-migrate-*/、manual/
│  │  └─ logs/                 #   紀錄檔
│  └─ public/                  # 前端建置產物（不進 git，啟動檔會自動重建）
├─ web/
│  ├─ index.html
│  └─ src/
│     ├─ main.js / App.vue / styles.css
│     ├─ i18n.js               # 中日文字典；{name} 佔位；getStrings(lang, companionName)
│     ├─ moods.js              # 情緒 → 顏色（前後端情緒清單必須一致，有測試）
│     ├─ avatarParts.js        # 觸摸部位詞彙、各角色的部位清單、normalizePart()（前後端清單一致，有測試）
│     ├─ avatarFaces.js        # 兩隻角色共用的表情規則（眼睛、嘴型）
│     ├─ limits.js             # 欄位字數上限（啟動時從 GET /api/config 拿，前端不寫數字）
│     ├─ clientLog.js          # 前端錯誤 → POST /api/log → 紀錄檔
│     ├─ api.js                # fetch 包裝：自動帶密碼 token、目前角色；401 → 上鎖
│     ├─ palettes.js           # 毛色
│     ├─ components/
│     │  ├─ AvatarAdapter.vue  # ★ 角色介面（variant 選角色；換 3D 只要加一個元件）
│     │  ├─ FullBodyAvatar.vue # 全身角色（預設）＋透明感應區
│     │  ├─ SvgAvatar.vue      # 舊版圓圓的角色（設定可切換）
│     │  ├─ HoldToSpeakButton.vue
│     │  ├─ BaseDialog.vue     # 對話框外殼（遮罩、Esc、dialog 語意、焦點）
│     │  ├─ SettingsPanel.vue / DiaryPanel.vue / FortuneCard.vue / HourlyWeather.vue
│     │  ├─ LockScreen.vue / CharacterPicker.vue / PaletteChooser.vue
│     │  └─ SeasonDecor.vue / ParticleLayer.vue
│     └─ composables/
│        ├─ useAvatarStatus.js # 角色狀態機＋日夜
│        ├─ useVoice.js        # STT／TTS
│        ├─ useAvatarHit.js    # 感應區點擊／滑過判斷（兩隻角色共用）
│        └─ useQuirks.js       # 閒置小動作、夢話、連戳、睡著時被戳
└─ tests/                      # node --test；見 8.
```

---

## 4. 後端

### 4.1 啟動與組裝

- `server/app.js` 的 `createApp()` 依序掛上：`localOnly` → `express.json({ limit: '1mb' })` → 靜態檔（`server/public`）
  → `/api` 路由 → 不存在的 `/api/*` 回 JSON 404 → 其他路徑回 `index.html`（SPA）→ `errorHandler`。
- `routes/index.js` 裡的順序：不用密碼的（health、lock/*、config、log）→ `requireUnlock`（`lib/lockGuard.js`）
  → 角色 middleware（依 `X-PokkaTomo-Character` 用 `withCharacter()` 包住後面的處理，見 4.12）→ 其他所有路由。
- `server/server.js`：`primeFmStatus()`（fm 可用的話對**每個角色** `backfillPastDiaries()`）、
  背景整理（每個角色 `ensureArchiveReady()` 把舊聊天匯入封存 → `runDailyBackup()` → `pruneLogs()`）、`listen(PORT, HOST)`、
  `OPEN_BROWSER` 時開瀏覽器、收到 `SIGTERM`／`SIGINT` 時停止接新請求並 `drainAll()` 等寫入做完（最多 1.5 秒）。

### 4.2 錯誤處理

所有路由用 `asyncHandler` 包；丟出的錯誤由 `errorHandler` 統一回 `{ error: <代碼>, message: <中文說明> }`。
**前端只看 `error` 代碼**，自己顯示翻譯好的文字（`message` 是給開發者看的中文，日文介面不能直接顯示）。

| `error` | HTTP | 什麼時候 | 前端顯示 |
|---|---|---|---|
| `bad_request` | 400 | 訊息空的／太長／不是字串 | `errMessageTooLong` |
| `fm_unavailable` | 503 | Apple Foundation Models 不能用 | `fmUnavailable` |
| `fm_error` | 500 | 模型失敗、逾時、回空白 | `errFallback`＋重送按鈕 |
| `weather_unavailable` | 503 | 查地點時連不上 Open-Meteo | 設定面板提示 |
| `forbidden` | 403 | Host 不是本機 | — |
| `not_found` | 404 | 不存在的 API | — |
| `internal_error` | 500 | 其他意外（不洩漏內部訊息） | `errFallback` |
| `locked` | 401 | 設了密碼但沒帶有效 token | 蓋上密碼畫面（`api.js` 的 `onLocked`） |
| `wrong_pin` | 401 | 密碼錯（多帶 `attemptsLeft`） | 密碼畫面顯示還剩幾次 |
| `too_many_attempts` | 429 | 連錯 5 次（多帶 `retryAfterSec`） | 倒數秒數 |
| `pin_exists` | 409 | 已經有密碼還打 setup | — |

### 4.3 API 參考

全部是 JSON。沒有列出的欄位不要依賴。
除了 health、config、log、`/lock/*`，**都要帶 `X-PokkaTomo-Token`**（有設密碼時）；
跟角色有關的（profile、history、chat、greet、diary、companion、fortune）用 `X-PokkaTomo-Character` 決定是哪個角色（沒帶＝第一個角色）。
一個角色都沒有時，只有 lock、config、log、`/characters*`、`/export`、`/import`、`/lan` 可以用，其他回 409 `no_character`（前端打開新增角色）。
前端由 `web/src/api.js` 自動加這兩個標頭。

| 方法與路徑 | 請求 | 回應 |
|---|---|---|
| `GET /api/lock/status` | — | `{ hasPin, unlocked }` |
| `POST /api/lock/setup` | `{ pin }` | `{ token }`（只能在還沒有密碼時） |
| `POST /api/lock/unlock` | `{ pin }` | `{ token }`；錯 401 `wrong_pin`；太多次 429 |
| `POST /api/lock/change` | `{ current, next }`＋token | `{ ok: true }` |
| `POST /api/lock/lock` | token | `{ ok: true }`（這個 token 作廢） |
| `GET /api/characters` | — | `{ characters: [{ id, name, avatarStyle, palette, firstMetAt, level }] }` |
| `POST /api/characters` | `{ name?, avatarStyle?, palette?, language? }` | `{ character }`；最多 12 個；其他設定一律預設值（4.12） |
| `PUT /api/characters/order` | `{ ids }` | `{ characters }`：照這個順序存（不認得的忽略、漏掉的接在後面）；第一個＝沒指定角色時用的 |
| `GET /api/lan` | — | `{ enabled, running, port, setupPort, urls, setupUrls, caFingerprint, error, speech, canManage }`（手機連線的狀態；`speech` = 語音辨識狀態，見 4.15；`canManage` = 是不是在這台電腦上） |
| `POST /api/lan/speech-check` | — | 同上；重新準備語音辨識（編譯＋問權限）。只能在這台電腦上 |
| `POST /api/speech` | body＝WAV（`audio/wav`，最多 8MB） | `{ text }`（沒聽到＝空字串）；用目前角色說話的語言；還不能用 503 `speech_unavailable`、失敗 500 `speech_failed` |
| `PUT /api/lan` | `{ enabled }` | 同上；只能在這台電腦上（手機上 403 `lan_manage_local_only`），打開前要先設定密碼（400 `pin_required`） |
| `DELETE /api/characters/:id` | `{ pin }` | `{ ok, id, name }`（資料整個刪掉，無法復原）；密碼錯 401 `wrong_pin`（含 `attemptsLeft`）、太多次 429；最後一個也可以刪（刪完＝沒有角色） |
| `GET /api/memory/search?q=` | 關鍵字（最多 50 字） | `{ conversations: [{ ts, role, content }] }`：目前角色封存裡提到關鍵字的話，新到舊最多 30 則，繁／日漢字互通 |
| `POST /api/import` | body＝匯出的 zip（`Content-Type: application/zip`，最大 300MB）＋標頭 `X-PokkaTomo-Pin` | `{ ok, files, characters, previousMovedTo }`；不是備份檔 400 `not_backup`／`bad_zip`／`bad_backup`（見 4.11） |


| `GET /api/health` | — | `{ ok: true, fm: { available, … } }` |
| `GET /api/profile` | — | profile（見 4.10） |
| `POST /api/profile` | profile 的部分欄位 | 儲存後的完整 profile（欄位經過淨化，不認得的忽略） |
| `GET /api/history?limit=N` | N 限制在 1～600，預設 20 | 最近 N 則訊息陣列（前端目前沒用到） |
| `GET /api/history/day?date=YYYY-MM-DD` | 不給 date = 今天；格式錯 400 | `{ date, messages: [{ role, content, ts, mood?, kind?, proactive?, fortune? }] }`，從永久封存讀、舊到新 |
| `POST /api/chat` | `{ message }`（1～500 字） | `{ reply, mood, ritual, growth, levelUp }` |
| `POST /api/greet` | — | `{ greeting, mood, missedDays, welcomeBack }` 或 `{ greeting: null }` |
| `GET /api/diary` | — | `{ entries: [新→舊], firstMetAt }`；順便在背景補寫過去的日記 |
| `POST /api/diary/today` | — | `{ entry }`；今天沒聊天時 `entry: null` |
| `GET /api/companion` | — | `{ growth: {level, points, currentMin, nextMin, progress, streakDays}, asleep, events: [{id}], fortuneToday }` |
| `POST /api/companion/pat` | `{ part? }` | `{ growth, levelUp }`（part 不認得當 `body`） |
| `POST /api/companion/wake` | — | `{ ok: true }` |
| `POST /api/fortune` | — | `{ fortune, fresh }`（`fresh: false` = 今天抽過，同一個結果） |
| `GET /api/weather` | — | `{ weather \| null, location \| null }`；weather 含 `current`、`today`、`tomorrow`、`hourly`（見 4.9） |
| `PUT /api/weather/location` | `{ query }` | `{ location }`；找不到 `{ location: null, notFound: true }`；空字串 = 清除 |
| `GET /api/config` | — | `{ limits: { message, nickname, companionName, persona, preference, preferencesCount, anniversaryName, anniversariesCount, city } }` |
| `GET /api/export` | — | zip 檔下載（`Content-Disposition: attachment`），內容見 4.12 |
| `POST /api/log` | `{ event, detail?, level? }` | `{ ok: true }`；寫進紀錄檔成 `client_<event>`；每分鐘最多 30 筆 |

`ritual`：`'morning' | 'leaving' | 'home' | 'goodnight' | null`。`mood`：見 4.7。

### 4.4 AI 模型（`fmService.js`）

- **CLI 介面（假設）**：`fm available`（成功 = 可用）、`fm respond --instructions <system prompt> <訊息>`（stdout = 回覆）。
  **沒有在真機上驗證過參數格式**；不同的話只改 `fmService.js`。`FM_BIN` 可換成別的執行檔（測試用假的）。
- **可用狀態快取**：`getFmStatus()`：已知可用就用快取；已知不可用就每次重查（使用者可能剛打開 Apple Intelligence）。
- **逾時**：`FM_TIMEOUT_MS`（預設 30 秒），時間到 `SIGKILL`。
- **背景佇列**：記憶提取、寫日記走 `runBackgroundFm()`，同時只跑一個；聊天本身不排隊，永遠優先。
- **上下文太長**：Apple Foundation Models 只有約 4096 tokens（輸入＋輸出）。各段都有長度上限（見 4.5），
  萬一模型還是回報太長（錯誤訊息含 context／token／exceed／window），`routes/chat.js` 用「只有人設＋儀式提示、
  不帶歷史」的精簡版自動重試一次。

### 4.5 Prompt 組成

`buildSystemPrompt({ persona, profile, memories, weather, extras, now })` 依序組成 system prompt（每項一行，空的略過）：

1. 人設（`profile.personaPrompt`，預設 `DEFAULT_PERSONA`，最多 300 字；**預設人設不含名字**）
2. 名字：「你的名字是「X」（如果上面的描述提到別的名字，以這個為準）」
   ＋**對自己的認識**（`lib/selfKnowledge.js`）：依角色外觀（全身／舊版、毛色）描述長相、胸口愛心＝心情燈與每個顏色的意思、
   哪些部位可以摸、會寫日記／看天氣／占卜／晚安會睡覺；被問到自己的事要照設定回答
   ＋**身份與說話規則**（`identityRulesLine`）：你就是「名字」本人、**絕對不能說自己是 AI／模型／程式**；
   不要每句都用招呼開頭；不要重複前面說過的事（幸運色、紀念日…）
3. 怎麼稱呼使用者（`nickname`）
4. 喜好：**只放跟這句話有關的**（`lib/relevance.js`：整個詞出現、或有共同的詞；問「我喜歡什麼」才全部放），寫成「記在心上，相關才順口帶到」
5. 現在時間（本地，含星期）
6. 天氣（有設定城市時）
7. 紀念日：**只有今天／3 天內、或這句話問到紀念日／生日、寫到那個日期（520、5/20、5月20）、提到名字時才放**
8. 最近 3 篇日記（不含今天）＝中期記憶：**只有主動問候時放**；聊天時日記跟舊對話一樣走 RAG，有關才想起來
9. RAG 想起來的舊事（最多 3 件、每件最多 110 字；見 4.6）
10. `extras`（聊天時：今天的節日、親密度說話風格＋認識第幾天＋觸摸習慣、這一輪的儀式提示；
   **只有使用者這句話提到占卜／運勢時**才帶今天的占卜結果或「請使用者按 🔮」，見 `fortuneService.isFortuneTopic`）
11. 說話風格（`styleGuideLine`）：繁中＝台灣朋友聊天的口語、語助詞、先接住對方再說自己的想法、兩個示範；日文＝タメ口、不用敬語
12. 情緒標籤指示（`MOOD_INSTRUCTION`，永遠在最後）

**訊息**：最近 8 則對話折進去（總共最多 900 字、每則最多 200 字，從新的往回放），標成「使用者」／「你」
（不寫角色名字，改名後才不會混淆），最後接「使用者現在說：…」。占卜卡片（`kind: 'fortune'`）不放進上下文。

### 4.6 記憶

| 層 | 存在哪 | 怎麼進 prompt |
|---|---|---|
| 短期 | `conversations/*.jsonl` 最新的幾則（從最新的月份檔往回讀） | 最近 8 則，折進訊息 |
| 中期 | `diary.json`（每天一篇，最多 3650 篇） | 主動問候：最近 3 篇；聊天：跟 RAG 一起檢索 |
| 長期（事實） | `user.json` 的 `preferences`、`anniversaries` | 只放跟這句話有關的（見 4.5） |
| 長期（回憶） | `conversations/*.jsonl`（全部對話，永久）＋全部日記 | RAG：依這句話的相關性找最多 3 件；已經在最近 8 則裡的（用紀錄 id 比對）不重複 |

- **關鍵記憶提取**（`extractFacts`）：**只把使用者自己說的話**送去（角色的回覆不送——以前角色說的「幸運色是珊瑚橘」
  被當成使用者的喜好存起來）。紀念日只有月日（「520」「5/20」）時存成今年那天＋`noYear: true`（不算第幾年）。
  每輪對話後在背景請模型抽出喜好／紀念日（只回 JSON，也抓得到 code fence 裡的），
  合併進 profile（喜好去重、最多留 30 項；同名紀念日更新日期；走 `updateProfile` 不會蓋掉同時的設定變更）。
  短訊息（< 6 字）、生活儀式不做。`DISABLE_FACT_EXTRACTION=1` 可整個關掉。
- **對話只存一份**（`archiveService.js`）：`appendMessages()` 追加到 `conversations/YYYY-MM.jsonl`（依訊息的本地月份）。
  「最近的對話」（`getRecentHistory`／`getAllHistory`，最多 600 則）從最新的月份檔往回讀，沒有另外的 `chat_history.json`。
  壞掉的行讀取時跳過。時間存到秒（`time` 字串）；同一秒的兩則照檔案順序。為什麼不用 SQLite：見檔案開頭註解。
- **日記**：角色第一人稱、只寫對話裡有的事、**不寫自己的名字**（也不告訴寫日記的模型名字，改名後舊日記才不會怪）。
  過去的日子在啟動、每輪聊天後、打開日記時在背景補寫（最多往回 3 天）；今天的由使用者按鈕觸發、可重寫。
- **輕量 RAG**（`ragService.js`＋`lib/textIndex.js`）：
  - 文件：一輪對話（使用者的話＋角色回覆，使用者的話權重加倍）或一篇日記。占卜、主動問候不索引。
  - 斷詞：NFKC、小寫；中日文取字元 bigram，日文先在平假名處切開（助詞、語尾不索引），單一漢字保留；
    常見繁體字形統一成日文新字體（天氣＝天気、貓＝猫），中日文混用時同漢字的詞可以對到；少量停用詞。
  - 排序：BM25（k1=1.2、b=0.75）；門檻 `RAG_MIN_SCORE`＝1.2，且要有第一名分數的一半（`RAG_RELATIVE_MIN`）。
  - 排除：已經在最近 8 則上下文裡的對話、已經放進 prompt 的日記、今天的日記；生活儀式與 < 4 字的訊息不搜。
  - 索引在記憶體：第一次用到時從封存＋日記建立，之後新訊息增量加入（`onArchiveAppend`）、日記版本變了重建日記部分。
  - 限制：詞完全不同的（拉麵／ラーメン）對不起來；沒有語意理解（「肚子餓」找不到「想吃拉麵」）。

### 4.7 情緒通道（`lib/mood.js`）

模型被要求在回覆開頭加 `[mood:xxx]`；伺服器用寬鬆的正規表達式解析（全形括號、全形冒號、大小寫、沒有 `mood:` 前綴都可以），
拿掉標籤後回傳 `{ reply, mood }`。認不得或沒加 → `calm`，文字照常。只有標籤沒有內容 → 當成錯誤。

情緒：`joy`（黃）、`love`（粉紅）、`calm`（薄荷綠，預設）、`sad`（藍）、`worried`（紫）、`surprised`（水藍）。
前端用它控制心情燈顏色、表情（sad／worried 有眉毛）、朗讀語速音高；15 秒沒新情緒回到 calm。

### 4.8 角色的生活（`companionService.js` 等）

- **親密度**：訊息 +1（每天上限 30）、每天第一次 +3、連續第二天以上再 +2、摸 +1（每天上限 10）。**只加不扣**。
  等級門檻 0／30／100／250／500／1000 → Lv1～6（初次見面、慢慢熟悉、好朋友、無話不談、心靈之友、家人）。
  等級改變 prompt 的說話風格、解鎖前端的反應台詞與小動作（Lv3 會「噗」、Lv4 夢話會叫使用者的暱稱）。
- **觸摸統計**：`totals.touches[part]`；某部位 ≥ 20 次且比第二名多一半以上 → 進說話風格（例如常被戳臉頰）。
  總摸數 ≥ 50 且 ≥ 訊息數的 30% → 「變得愛撒嬌」。
- **生活儀式**（`lib/rituals.js`）：短句、以關鍵字為主才算（「我回來了之後一直在想…」不算；單字詞只接受完全相同，
  避免「早餐吃什麼」被當早安）。
  - 晚安 → `sleepingSince`；睡到下一個早上 6 點、至少 4 小時；說任何話就醒；前端 4 秒內連點 3 下可叫醒（`/api/companion/wake`）。
  - 出門 → `leftAt`；回家（或下次主動問候）說歡迎回來＋出去幾小時；超過 18 小時不算。
- **主動問候**（`greetService.js`）：一天四時段（早 5–11、午 11–17、晚 17–23、深夜 23–5，凌晨算前一天），每時段最多一次
  （存在 history 的 `proactive` 欄位）；20 分鐘內剛聊過不插話；睡著不打招呼；同時多分頁共用同一次產生。
  情境優先順序：第一次見面 → ≥2 天沒來（想你了）→ 出門回來 → 一般問候。問候存進聊天紀錄；**產生成功後**才清掉 `leftAt`。
- **今日占卜**（`fortuneService.js`）：運勢（大吉～末吉，沒有凶）、幸運色、幸運物、幸運數字用「日期＋認識那天」
  當種子決定（一天一次、可重現）；說明由模型寫，失敗用固定句型。寫進聊天紀錄（`kind: 'fortune'`）。
  同時多次請求共用同一個 in-flight。切語言只重寫說明。聊天時 prompt 會帶今天的結果，模型不會另外編。
- **節日**（`lib/seasons.js`）：國曆固定節日＋賞櫻季＋農曆（新年除夕～初三、端午、七夕、中秋），農曆表算到 2035 年。

### 4.9 天氣（`weatherService.js`）

Open-Meteo（免費、免 key）。設定城市 → geocoding 查經緯度存 `profile.location`。天氣快取 30 分鐘；
3 小時內的舊快取先用、背景更新；沒快取時聊天最多等 2.5 秒；**失敗後 5 分鐘內不再等**（沒網路時聊天不會變慢）。
`hourly`：從「現在這個小時」開始 27 格（多 3 格給 3 小時內的舊快取用），每格
`{ time: 當地時間字串, ts: 那小時開始的毫秒, hour, text, emoji, temp, rainChance }`；晚上的晴天 emoji 換成 🌙（用 `is_day`）。
`ts` 用 Open-Meteo 的 `utc_offset_seconds` 換算，前端（`web/src/weatherHours.js`）用它濾掉已經過去的小時、顯示 24 格。
開發沙盒連不到 Open-Meteo，程式照官方文件格式寫並用假伺服器測試，**沒在真網路驗證過**。

### 4.10 資料檔

都在 `DATA_DIR`（預設 `server/data`，測試時指到暫存資料夾）。寫入一律 `writeJsonAtomic`（暫存檔＋rename，2 格縮排）、
同一個檔案的讀-改-寫用 `asyncQueue` 排隊；讀到壞掉的 JSON 會改名成 `*.corrupt-<時間>` 備份再用預設值。
**專案資料夾被搬走時不寫入**（`lib/dataHome.js`）：`server/data` 的上一層不見了（伺服器還開著時把專案資料夾改名）就不寫紀錄檔、其他寫入丟錯誤、不建任何資料夾，舊伺服器印出提示後自己結束。
**時間一律存成人看得懂的本地時間＋時區**（`2026-09-29T10:22:20+08:00`，`lib/time.js` 的 `toLocalIso`），程式裡用毫秒數字（`parseTime`）。
路徑都由 `lib/characterContext.js` 的 `charPaths()` 算，不要在別的地方寫死。

```
server/data/
├─ app/                              全部角色共用
│  ├─ security.json                  密碼雜湊（4.13）
│  └─ characters.json                角色清單：順序＋編號＋名字（給人看的索引；名字以 character.json 為準，改名時一起寫）
├─ characters/
│  └─ 001/  002/ …                   每個角色一個資料夾，內容都一樣（編號不用名字：改名不用搬資料夾）
│     ├─ character.json              角色本身
│     ├─ user.json                   這個角色認識的你
│     ├─ state.json                  親密度、今天的計數、睡覺／出門、今天的占卜
│     ├─ diary.json                  日記
│     └─ conversations/YYYY-MM.jsonl 全部對話（唯一一份，只追加）
├─ backups/
│  ├─ daily/YYYY-MM-DD/              每日自動備份（app/＋characters/ 完整複製，留 14 份）
│  ├─ before-import-<時間>/          匯入備份前的資料
│  ├─ before-migrate-<時間>/         2026-09 從舊結構轉換前的原始檔案
│  └─ manual/                        手動留的備份
└─ logs/YYYY-MM-DD.log
```

**`character.json`**
```jsonc
{
  "id": "001",
  "name": "毛毛",              // 空 = 預設（PokkaTomo／ポッカとも）（≤20）
  "language": "ja",            // 說話的語言 'zh' | 'ja'：建立時決定，之後不能改
  "personaPrompt": "…",        // 個性（後端 ≤300；介面 150）；空 = 那個語言的預設個性
  "avatarStyle": "full",       // 'full' | 'classic'
  "palette": "mint",           // peach | cocoa | cream | mint | sakura | gray
  "voice": "Kyoko",            // 瀏覽器聲音的 voiceURI；空 = 自動挑最好的
  "voicePitch": 1.05,          // 0.6～1.6
  "voiceRate": 1.1,            // 0.7～1.4
  "firstMetAt": "2026-09-28",  // 第一次聊天那天（自動寫入一次）| null
  "createdAt": "2026-09-28T22:21:09+08:00"  // | null（不知道）
}
```

**`user.json`**（新角色：稱呼「主人」／「ご主人さま」，其他空白）
```jsonc
{
  "nickname": "小美",        // 角色怎麼稱呼你（後端 ≤40；介面 ≤20）
  "uiLanguage": "zh",        // 介面顯示的語言；null = 跟角色說話的語言一樣
  "location": null,          // { query, name, admin1, country, latitude, longitude } | null（天氣用；admin1 是 Open-Meteo 原樣回傳的）
  "preferences": ["…"],      // 喜好（每項 ≤40、≤50 項；記憶提取合併後保留 30 項）
  "anniversaries": [{ "name": "…", "date": "YYYY-MM-DD", "noYear": true }]  // noYear：只知道月日
}
```

**`state.json`**
```jsonc
{
  "points": 39,
  "daily": { "date": "YYYY-MM-DD", "chatPoints": 0, "patPoints": 6 },   // 今天加了幾分（每日上限用）
  "streak": { "lastDay": "YYYY-MM-DD", "days": 1 },
  "totals": { "messages": 20, "pats": 29, "touches": { "head": 4 } },
  "sleepingSince": null,     // 說晚安的時間 | null
  "leftAt": null,            // 說出門的時間 | null
  "fortune": null            // 今天的占卜 { date, lang, rank, rankText, color, item, number, text, mood, createdAt }
}
```

**`diary.json`**（陣列，舊→新，最多 3650 篇）：`{ "date": "YYYY-MM-DD", "text": "…", "mood": "love", "createdAt": "…+08:00" }`

**`conversations/YYYY-MM.jsonl`**（一行一則，只追加，欄位順序固定）
```jsonc
{"id":"mujcwnpl-0-u","time":"2026-09-27T13:06:56+08:00","role":"user","content":"我說呢"}
{"id":"…","time":"…","role":"assistant","content":"喔！你好喔～","mood":"joy"}
// 選用：proactive（主動問候的時段，例如 "2026-09-28:morning"）、kind: "fortune" ＋ fortune（占卜結果，不含說明——說明就在 content 第二行以後，讀出來時補回 fortune.text）
```

**`app/characters.json`**：`[{ "id": "001", "name": "毛毛" }, …]`
**`app/security.json`**：`{ algo: 'scrypt', salt, pinHash, updatedAt }`

**`logs/YYYY-MM-DD.log`**：一行一筆 `{ t: 本地時間, level, event, ...欄位 }`，保留 30 天。**不記對話內容**。
主要事件：`server_start`／`server_stop`、`fm_ok`／`fm_failed`（purpose: chat／extract／diary／greet／fortune，含耗時 ms）、
`api_error`、`unexpected_error`、`rag_recall`、`rag_index_built`、`backup_done`、`export_done`、`weather_failed`、
`json_corrupt_backed_up`、`character_created`／`character_deleted`、`backup_imported`、`client_*`（前端回報）。

所有欄位缺少時都有預設值。

**舊結構（v1，2026-09 以前）**：第一個角色的 `user_profile.json`、`chat_history.json`、`companion_state.json`、`diary.json`、
`archive/` 直接放在最上層，其他角色在 `characters/<亂碼 id>/`；對話同時存在 `chat_history.json` 與 `archive/`；時間是毫秒數字。
2026-09-29 用 `scripts/migrate-v2.js` 在使用者的電腦上一次轉換（先把整個資料夾打包成 `backups/manual/full-before-migrate-*.tar.gz`，
舊檔案整份搬到 `backups/before-migrate-*`，轉換後比對每個角色的對話則數、日記篇數、親密度都一樣）。
程式只讀新結構；舊版匯出的 zip 在匯入時用 `lib/layoutV1.js` 轉換。

### 4.11 匯出（`exportService.js`）

`GET /api/export`（要密碼）產生 `pokkatomo-YYYY-MM-DD.zip`（`lib/zip.js`，UTF-8 檔名）：
`README.txt`、**每個角色一個資料夾** `<角色名字>/對話紀錄.txt`、`<角色名字>/日記.txt`，
`data/app/`（角色清單、密碼雜湊）、`data/characters/<編號>/`（跟 server/data 一樣的結構）、`logs/*.log`。不含 `backups/`。

**匯入**（設定面板「⬆️ 匯入備份」→ 再輸入一次密碼 → `POST /api/import`，`dataAdminService.importBackup`）：
`lib/zip.js` 的 `readZip()` 讀 zip，只挑 `data/` 底下合規則的路徑（`app/characters.json`、`characters/<編號>/{character,user,state,diary}.json`、
`characters/<編號>/conversations/YYYY-MM.jsonl`；舊版 zip 的路徑也認得，會先用 `lib/layoutV1.js` 轉成新結構；
`..`、壞檔備份、暫存檔、其他檔案一律忽略），**密碼不匯入（維持這台的）**。JSON 先全部檢查能解析才動手。
接著把現在的資料（除了 `backups/`、`logs/`、`app/security.json`）整份搬到 `backups/before-import-<日期時間>/`，再寫入 zip 的資料，
最後 `resetCaches()`（`lib/cacheRegistry.js`：RAG 索引、封存匯入狀態、日記版本、天氣快取）。前端回到選角色畫面。
每日備份的自動清理只清 `backups/daily/`，不會刪到 `before-import-*`。

### 4.12 多角色（`characterService.js`、`lib/characterContext.js`）

- **每個角色完全獨立**：名字、個性、外觀（`avatarStyle`）、毛色（`palette`：peach／cocoa／cream／mint／sakura／gray）、
  聲音、認識那天、對話紀錄、永久封存、日記、親密度／睡覺／出門／占卜、RAG 索引，
  **還有設定面板的所有設定與語言**：怎麼稱呼使用者、喜好、紀念日、城市、介面語言（各角色資料夾裡的 `user.json`）。
  語言分兩個欄位：`language`（在 `character.json`）＝角色**說話的語言**（回覆、語音朗讀／辨識、日記、占卜、稱呼、預設個性），**建立角色時決定、之後不能改**
  （`POST /api/profile` 會忽略 `language`；設定面板只顯示不給改）；`uiLanguage`＝**介面顯示的語言**，上方 🌐 隨時切換，沒設定時跟 `language` 一樣。
  例如日文角色可以用中文介面操作，角色還是講日文；切換角色時兩種語言都換成那個角色的。新增角色**不複製任何角色的設定**，一律從預設值開始（`profileService.freshProfile`）：稱呼「主人」（日文「ご主人さま」）、預設個性（選日文就是日文版 `DEFAULT_PERSONA_JA`）、喜好／紀念日／城市全部空白；
  讀取時沒改過的預設個性一律顯示角色語言的版本；說話的語言由新增表單上的「說話的語言（建立後不能更改）」選（預設選在畫面目前的語言）。
  只有密碼（`app/security.json`）是共用的；右上角的靜音、💭 泡泡、💬 文字對話開關是這台瀏覽器的偏好（localStorage）。
- 角色：`characters/<編號>/character.json`；順序在 `app/characters.json`（沒有或壞掉時照資料夾編號排）。
  編號 `001`、`002`…（新角色＝現有最大編號＋1）。一個角色都沒有（全新安裝、全部刪掉）時**不自動建立**：清單是空的，前端直接打開新增表單；
  預設值（稱呼、個性…）只在新增時套用（`createCharacter`＋`freshProfile`）。
  沒指定角色、或指定的不存在時用清單第一個（`setFallbackCharacterId`）。
- **怎麼知道是哪個角色**：`AsyncLocalStorage`。請求進來時 `withCharacter(id, next)`，之後這個請求裡所有的非同步工作
  （包含不 await 的背景記憶提取、補寫日記）呼叫 `currentCharacterId()`／`charPaths()` 都拿到同一個角色。
  **不在請求裡的工作要自己包**（`server.js` 的 `forEachCharacter`、`exportService` 逐一角色匯出）。
  模組層級的快取都依角色分開（日記版本、補寫進行中、占卜產生中、問候產生中、RAG 索引）。
- `getProfile()` 回傳「使用者資料＋目前角色的欄位」（對外仍用 `companionName` 等舊名字），`saveProfile()` 自動拆成兩邊存，
  所以 prompt、日記、設定面板都不用知道有多角色。
- **刪除角色**（選角色畫面卡片右上角 🗑 → 再輸入一次密碼 → `DELETE /api/characters/:id`，`dataAdminService.deleteCharacter`）：
  從清單拿掉（至少留一個），**整個 `characters/<編號>/` 刪掉，每日備份裡那個角色的資料也刪**，無法復原（開發者決定：刪了就算了）。
- **排序**（選角色畫面卡片左上角 ⠿ 拖曳，或把手上按方向鍵 → `PUT /api/characters/order`）：存進 `app/characters.json` 的順序。
  拖曳用 pointer 事件自己做（HTML5 drag & drop 在 iPad 上不能用），move／up 掛在 window（卡片重新排列時把手會失去 pointer capture）。
- 重要操作（刪除角色、匯入）前的密碼確認用 `lockService.verifyPin()`：不產生新 token、錯了一樣算次數、會被暫時鎖住。

### 4.13 密碼鎖（`lockService.js`、`lib/lockGuard.js`、`routes/lock.js`）

目的是「防君子」：別人打開畫面看不到對話。**資料檔本身沒有加密**，開發者需要時可以直接看 `server/data/`。
- 密碼 4 位數字，存 scrypt 雜湊＋salt 在 `app/security.json`（不存明碼）。
- 解鎖後發隨機 token（只在伺服器記憶體），20 分鐘沒有請求就失效；伺服器重開全部失效。前端 token 只放記憶體，重新整理要重新輸入。
- 沒設定過密碼時 API 不擋（第一次打開前端會先要使用者設定）。
- 連錯 5 次鎖 1 分鐘（記憶體，伺服器重開歸零）。
- **忘記密碼**：刪掉 `server/data/app/security.json`，下次打開會請使用者重新設定，其他資料不受影響。

### 4.14 設定值（`server/config.js`）

| 環境變數 | 預設 | 用途 |
|---|---|---|
| `PORT` | 3000 | |
| `HOST` | 127.0.0.1 | 改成 0.0.0.0 會對外開放（並自動關掉 Host 檢查）——要先加密碼 |
| `POKKATOMO_DATA_DIR` | `server/data` | 資料夾 |
| `POKKATOMO_OPEN_BROWSER` | 開 | `0` = 伺服器不自己開瀏覽器（啟動檔會設） |
| `FM_BIN` | `fm` | 模型執行檔 |
| `FM_TIMEOUT_MS` | 30000 | |
| `DISABLE_FACT_EXTRACTION` | 關 | 任何非空值 = 不做背景記憶提取 |
| `WEATHER_API_BASE` / `GEOCODE_API_BASE` | Open-Meteo | 換天氣來源或測試 |

**程式不會讀 `.env` 檔**（沒有 dotenv），要在啟動前的環境設定。其他常數（上限、門檻、預算、時間）都在 `config.js`，有註解。

**字數上限只有一份**：`config.js` 的 `LIMITS`。後端（`profileService`、`routes/chat.js`、`routes/weather.js`）用它擋／截斷，
前端從 `GET /api/config` 拿（`web/src/limits.js`），各輸入框的 `maxlength` 綁它；還沒載入前沒有 maxlength，但後端一樣會擋。

---

### 4.15 手機／平板連線（`lanService.js`、`lib/lanGuard.js`）

- 平常只聽 `127.0.0.1:PORT`。設定裡打開後，**另外**在 `0.0.0.0:LAN_PORT`（預設 PORT＋1＝3001，`POKKATOMO_LAN_PORT`）開一個 **HTTPS** 伺服器，
  用同一個程序裡另一份 Express app（`createApp({ lan: true })`），所以資料、密碼、登入 token 都共用；關掉就停掉那個伺服器。
  開關記在 `app/settings.json` 的 `lanEnabled`，伺服器啟動時照著開（`startLanIfEnabled`）。
- `lanGuard`（取代本機用的 `localOnly`）：來源 IP 要是區網（10／172.16–31／192.168／169.254／fe80／fc00、127），
  Host 要是區網 IP 或 `<這台電腦>.local`（擋 DNS rebinding），功能關掉後進來的也擋。其他 API 一樣要密碼。
- 開關只能在這台電腦上改（`req.fromLan` 的請求 403），打開前要先設定密碼。
- 設定面板的 `LanPanel.vue` 顯示網址（`<電腦名稱>.local` 優先，IP 換了不用重掃）和 QR code（`qrcode-generator`）。
- **HTTPS（`lib/lanTls.js`，node-forge）**：瀏覽器規定麥克風只能在安全連線用。第一次打開時在 `server/data/tls/` 產生「PokkaTomo Home CA」（10 年）
  ＋伺服器憑證（397 天，SAN＝`<電腦>.local`、localhost、127.0.0.1、現在的區網 IP）。每 10 分鐘檢查：IP／名稱變了或剩不到 30 天就用同一張 CA 重簽、
  `setSecureContext` 直接換上（手機不用重裝）。`tls/` 不匯出、不備份，匯入備份時也不搬走；`ca.key` 絕對不能從任何路由送出去。
- **第一次設定頁（`lanSetupApp.js`，`LAN_SETUP_PORT`＝LAN_PORT＋1＝3002，HTTP）**：一樣過 `lanGuard`。`/` 是中／日步驟說明（看 Accept-Language，`?lang=`），
  `/pokkatomo-ca.crt` 用 `application/x-x509-ca-cert`（Buffer，不加 charset，iOS 才會當描述檔），其他路徑 302 到 HTTPS。
  頁面用 `fetch(https…, {mode:'no-cors'})` 檢查這台手機是否已經信任（沒信任時連線會直接失敗）。iOS 要用 Safari 才能安裝描述檔。
- **手機的語音輸入（`speechService.js`、`native/speech.swift`、前端 `recorder.js`）**：
  iPhone 上的 Chrome 是 WebKit，瀏覽器的語音辨識不穩定，所以手機只錄音：`recorder.js` 用 getUserMedia＋ScriptProcessor 收音，
  自己降到 16kHz 單聲道 16-bit WAV（iPhone 的 MediaRecorder 是分段 MP4，Mac 不一定讀得了），放開後 `POST /api/speech`。
  每次放開就關掉麥克風（開著的話 iOS 會把聲音輸出切成通話模式，角色講話變小聲）。
  Mac 端：`prepareSpeech()`（手機連線打開時在背景）用 `xcrun swiftc` 把 `speech.swift` 編成 `native/build/PokkaTomoSpeech.app`
  （Info.plist 有 `NSSpeechRecognitionUsageDescription`、`LSUIElement`，ad-hoc codesign；原始碼沒變就不重編，因為重編後 macOS 要重新允許），
  再用 `open -W -n -g --stdout … -a PokkaTomoSpeech.app --args --authorize` 問權限。用 `.app＋open` 是為了讓「允許語音辨識」算在這個 App，
  不是算在啟動它的終端機。辨識：`--args <wav> <zh-TW|ja-JP>`，stdout 一行 JSON；`requiresOnDeviceRecognition` 優先，這台 Mac 沒有那個語言的離線辨識時才改用 Apple 伺服器。
  一次處理一個（asyncQueue）。狀態 `speech.state`：unsupported／idle／no_compiler／building／build_failed／ready；`speech.auth`：authorized／denied／notDetermined…
  前端：`/api/config` 回 `lan`、`serverSpeech`；`useVoice` 的 `serverMode`（手機連線＋Mac 辨識可以用＋能錄音）走錄音，否則電腦上照舊用瀏覽器的 Web Speech。
  手機上 Mac 辨識不能用時變成只能打字（`unsupportedNoteRemote`、招呼教打字）。測試用 `POKKATOMO_SPEECH_BIN` 指定假的辨識程式。

## 5. 前端

### 5.1 App.vue

整個畫面的協調者：進入流程（密碼 → 選角色 → `startSession()`）、載入資料（health、profile、companion、weather、今天稍早的對話數）、
對話流程、錯誤與重送、主動問候、紀念日提醒、占卜、升級慶祝、觸摸反應、對話泡泡、占卜彈窗、閒置上鎖、各種計時器。

**進入流程**：`boot()` 問 `/api/lock/status` → `LockScreen.vue`（setup：輸入兩次；unlock）→ 拿到 token 存進 `api.js` 的 `session`
→ `CharacterPicker.vue`（列出角色、可新增：名字＋樣子＋毛色）→ 選好後 `session.characterId` → `startSession()`
（清掉上一個角色的畫面狀態，載入資料、問候）。按左上角的名字可以隨時回到選角色畫面。
**閒置上鎖**：15 分鐘沒有點擊／按鍵／觸控（角色正在聽、想、講話不算閒置）→ 通知 `/api/lock/lock`、蓋上密碼畫面；
解鎖後回到原本的角色。任何 API 回 401 `locked`（伺服器重開、token 過期）也會蓋上密碼畫面。

**文字對話預設隱藏**（主要用語音）：麥克風上方「💬 顯示文字對話」切換，記在 `localStorage` 的 `pokkatomo.showChat`；
旁邊是「🕘 今天稍早的對話（N）」（只在文字對話打開時出現）。寬螢幕隱藏時改成單欄置中。
隱藏時角色說的話以**漫畫對話泡泡**從角色頭的左上／右上冒出來（`.speech-bubble`，絕對定位在 `.avatar-anchor` 裡；
外層有尾巴、內層 `.speech-body` 太長時捲動；寬度最多到畫面一半所以窄螢幕不會跑出去）：
講完再停 4.5 秒，靜音時依字數；想的時候泡泡裡是「…」；出錯時帶重送按鈕、不自動消失；**使用者自己說的話不顯示**。
右上角 🔊 旁邊的 💭 可以關掉泡泡（只在文字對話隱藏時出現，記在 `pokkatomo.showSpeech`）。
點角色的反應泡泡會自動避開對話泡泡那一邊。
**話很長時不會超出畫面**（`fitSpeechBubble`）：量角色上方實際剩多少空間，內容高度最多到頭頂區下緣；
上方太擠（寬而矮的螢幕）但角色左右有空間時，泡泡改放在角色旁邊（頭的高度往下長，尾巴從側邊指向頭）。
放不下的部分在泡泡裡捲動，底部淡出提示還有字；唸的時候跟著捲（有 `onboundary` 就照唸到的位置，沒有就依估計時間），
使用者自己滑過就不再自動捲。語音的保險逾時改依長度與語速估（最多 2 分鐘），長的話不會唸到一半就被當成唸完。
**今日占卜**：右上角天氣旁邊的 🔮；結果以小視窗蓋在角色上面（`.fortune-pop`），✕ 或 Esc 關閉；文字對話打開時聊天紀錄裡也有一張。
**版面由上而下**：頭頂區（`.top-bar`）→ 角色區（`.avatar-stage`，佔滿中間剩下的空間，角色在正中間）→ 按鈕區（`.conversation`：
文字對話開關、按住說話、打字框）。**角色位置不會被推動**：泡泡、占卜、每小時天氣都是角色之上的圖層（絕對定位）；
按鈕區高度固定（打字框收起時用 `visibility: hidden` 保留位置）；文字對話打開時聊天紀錄固定高度、在裡面捲動，
角色縮小（`.chat-shown` 的 `--avatar-size`）。角色大小受視窗高度限制，不會大到蓋住按鈕區；按鈕區 `z-index` 也在角色之上。
寬螢幕、文字對話打開時角色在左欄、聊天在右欄。

| 計時器 | 間隔 | 用途 |
|---|---|---|
| health 輪詢 | 15 秒（只在有警告時） | AI 恢復時自動收掉警告 |
| weather | 30 分鐘 | 天氣徽章 |
| companion | 10 分鐘 | 跨日：節日、睡覺狀態、占卜狀態 |
| 主動問候 | 選好角色時、切回分頁時（10 分鐘內不重問） | |
| 閒置上鎖檢查 | 30 秒一次，15 分鐘沒操作就上鎖 | |
| 「還在想」提示 | 6 秒 | 模型想太久 |
| 問候產生中「…」 | 0.4 秒後顯示 | 不鎖麥克風 |
| 情緒回到 calm | 15 秒 | |
| 摸摸 API 節流 | 1.5 秒 | 反應泡泡顯示 1.8 秒 |

**一打開畫面不顯示舊對話**：聊天區是空的（只有這次的問候）。今天稍早有聊過的話，聊天區最上面有
「🕘 看今天稍早的對話（N 則）」按鈕，按下去從 `GET /api/history/day` 讀出「這次打開網頁之前」的今天對話，
以淡色泡泡＋時間顯示在最上面、下面一條分隔線，再按一次收起。本機的招呼語：第一次見面（沒有 `firstMetAt`）用自我介紹＋教學，
之後用 `greetingReturn` 隨機一句。

**天氣徽章是按鈕**：按一下打開 `HourlyWeather.vue`（接下來 24 小時，橫向捲動，降雨機率 ≥20% 才顯示水滴），
再按一次、按 Esc、點面板外面都會收起。寬螢幕是徽章下面的下拉面板；≤560px 改成貼齊畫面左右的固定面板。

`localStorage`：`pokkatomo.muted`（靜音）、`pokkatomo.showChat`（文字對話顯示）、`pokkatomo.anniversaryShownOn`（紀念日一天只提一次）。
密碼 token **不**存 localStorage（重新整理就要重新輸入）。
前端錯誤（全域例外、Promise、Vue、語音辨識錯誤、聊天失敗）用 `clientLog.js` 回報到後端紀錄檔，同一個錯誤 30 秒內只送一次。
錯誤代碼 → 文字：`localizeChatError()`。

### 5.2 角色介面（`AvatarAdapter.vue`）——換角色時只要遵守這個

**Props**

| prop | 值 |
|---|---|
| `variant` | `full`（全身，`FullBodyAvatar.vue`，預設）｜`classic`（舊版，`SvgAvatar.vue`）；來自 `profile.avatarStyle` |
| `status` | `IDLE` `LISTENING` `THINKING` `SPEAKING` `HAPPY` `SLEEPY`（晚上 23–7 點閒置時）`ASLEEP`（說晚安後） |
| `mood` | `joy` `love` `calm` `sad` `worried` `surprised` |
| `quirk` | 一次性小動作：`sneeze` `yawn` `hiccup` `hum` `lookaround` `dizzy` `toot` `blush` `earwiggle` `giggle` `wave` `hop` `tailwag`（約 1.6 秒）、`eat` `dance`（約 3.6 秒）；`wave` 之後的都只有全身角色有動畫 |
| `accessory` | 節日配件 `santa` `witch` `sakura`；沒有節日時換季服裝 `flowers`（3–5 月小花冠）`strawhat`（6–8 月草帽）`beret`（9–11 月貝雷帽＋楓葉）`scarf`（12–2 月圍巾），見 `outfits.js`；只有全身角色有 |
| `label` | 螢幕報讀器唸的名字 |

**事件**：`touch { part, side }`、`hover { part, side }`。部位詞彙在 `web/src/avatarParts.js`：
`head face cheek ear belly body hand foot tail back`。全身角色標了 `FULL_BODY_PARTS`（除了 back），舊版角色標了
`CLASSIC_AVATAR_PARTS`（前六個）；測試會比對 .vue 裡的 `data-part` 跟清單一致、每個部位都有中日文台詞。`back` 預留給能轉身的 3D 角色；
`normalizePart()` 會把同義詞、左右、3D 骨架寫法（`LeftHand`、`Ear.L`）統一，不認得的當 `body`。
後端 `companionService.TOUCH_PARTS` 必須是同一份清單（有測試）。

**兩隻角色的共同做法**：看得到的形狀都 `pointer-events: none`，最上層疊一組透明感應區（`.hit [data-part][data-side]`），
只有點到感應區才算（點角色旁邊的空白不算）；感應區跟著角色浮動。可以 Tab 選到，Enter／空白鍵 = 摸頭。
點擊／hover 判斷在 `useAvatarHit.js`、表情規則在 `avatarFaces.js`，兩隻共用。

**`FullBodyAvatar.vue`**（手繪風原創小動物，純 SVG＋CSS，幾 KB）：大頭、圓耳朵、短手腳、蓬蓬尾巴、胸口愛心形心情燈、
地上的影子。身體語言：LISTENING 歪頭＋耳朵亮、THINKING 手摸下巴、SPEAKING 手跟著擺、HAPPY 雙手舉高、
ASLEEP 整隻變淡紫＋頭低下＋尾巴捲起＋戴睡帽（蓋過季節的帽子）；待機時尾巴輕晃、眨眼。
**吃東西**（`eat`）：雙手捧著飯糰、頭一下一下低下去咬、嘴巴嚼、掉碎屑（冬天圍巾時飯糰畫在圍巾前面）。
**跳舞**（`dance`）：左右手輪流舉高、身體左右扭＋小跳步、頭跟著歪、音符、尾巴猛搖。
觸發：閒置小動作池（吃飯時間 7–9、11:30–13:30、15–16、18–20 點比較常吃點心；Lv2 以上偶爾自己跳舞）；
聊到吃的／音樂跳舞時講完話就吃一口／跳一段（`useQuirks.reactionQuirkFor`）；親密度升級慶祝後跳舞。所有會動的 `<g>` 用 `transform-box: view-box`＋
以 px 指定的 transform-origin（瀏覽器算 bounding box 的方式不同，用 fill-box 容易歪）。不用 SVG filter（Safari 效能差）。

**換成全身／3D 角色**：新元件吃同樣的 props、用 `data-part` 或 raycast 回報 `touch`；名稱不同在 `PART_ALIASES` 加對照；
新部位要專屬台詞就在 `i18n.js` 的 `partReactions` 補（沒補會用一般反應）；最後在 `AvatarAdapter` 把 `currentAvatarComponent`
指到新元件。`App.vue` 不用改。

**觸摸反應**（App.vue）：講話中點 → 停止朗讀；睡著時 → 嘟囔，4 秒內第 3 下醒；3 秒內 5 下 → 頭暈；
其他 → 部位台詞（摸頭另加親密度解鎖台詞）＋部位小動作（`PART_QUIRK`：臉頰 blush、耳朵 earwiggle、肚子 giggle、
手 wave、腳 hop、尾巴 tailwag）
＋泡泡從左右側冒出＋ `POST /api/companion/pat {part}`（1.5 秒最多一次）。

### 5.3 其他元件與 composable

- `HoldToSpeakButton`：按住說話（pointer 事件，滑出按鈕也會停）、⌨️ 打字框（最多 500 字；輸入法選字的 Enter 不送出）、
  不支援語音辨識時固定顯示打字框；`busyHint`／`idleHint` 可換提示文字。
- `useVoice`：STT = `SpeechRecognition`／`webkitSpeechRecognition`；TTS = `speechSynthesis`，第一次按鈕時 `unlockAudio()`
  （Safari 需要使用者手勢），`speak()` 有依長度估計的保險逾時（Chrome 有時不觸發 onend），`stopSpeaking()` 保證觸發 onEnd。
  **聲音**（`voices.js`）：依語言列出瀏覽器的聲音，依品質排序（Premium／優化 ★★★ > Google ★★ > 一般），
  角色沒選就自動挑最好的；每個角色存 `voiceZh`、`voiceJa`（voiceURI）、`voicePitch`、`voiceRate`，設定面板可以選、調、試聽。
  情緒只小幅調整（±5% 左右；以前音高固定拉到 1.15～1.3，聽起來很假）。唸之前 `sanitizeForSpeech()` 拿掉表情符號、「～」、「…」、（動作描述）。
- `useAvatarStatus`：狀態機、日夜判斷（每分鐘）、`setAsleep()`（講話中不打斷）、`setStatus(x, { autoRestMs })`（不蓋掉中途的新狀態）。
  lifecycle hook 用 `getCurrentInstance()` 保護，可以在測試裡直接用。
- `useQuirks`：閒置小動作每 3～6 分鐘（分頁在背景、有面板、正在傳訊息時不做）、夢話每 35～80 秒（會夢到喜好；Lv4 會叫暱稱）、
  連戳、睡著時被戳；`stop()` 清掉所有計時器。
- `SettingsPanel`：儲存成功就關閉並由 App.vue 顯示上方小提示（`showToast`）；失敗不關，錯誤顯示在底部按鈕旁（`.footer-status`）。
  內容：（目前角色的）名字、個性、外觀、毛色；（使用者的）暱稱、城市、喜好、紀念日；改密碼（目前＋新＋確認）；
  「匯出所有資料」（`downloadFrom('/api/export')`）、「匯入備份」（選 zip → 警告＋密碼 → `POST /api/import`，成功後 App 回到選角色畫面）。打開前 App 會重抓 profile（避免用舊資料蓋掉背景學到的喜好）；
  紀念日只填一半會擋下並標紅；城市有改才查地點。
- `DiaryPanel`：月曆（週日開頭）、心情顏色、♥ 紀念日、⭐ 認識那天、翻月份、親密度等級與進度條、寫／重寫今天。
  選到的那天下面有兩個頁籤：**📖 日記**／**💬 對話**（`GET /api/history/day?date=`，那天的全部對話＋時間）。
- `LockScreen`：四位數密碼蓋板（完全不透明）；數字鍵盤＋實體鍵盤；錯誤會搖一下並顯示剩幾次／倒數。
- `CharacterPicker`：角色卡片（小角色＋名字＋等級；右上角 🗑 刪除，只剩一隻時不顯示）、新增角色表單（名字、說話的語言、全身／舊版、毛色 `PaletteChooser`）、
  刪除確認（說明資料會留備份＋`PinField` 輸入密碼）。
- `MemoryPanel`（上方 💝「{name} 記得的事」）：由上而下是**關鍵字搜尋**、**記憶內容**（喜歡的東西、重要的日子，可以 ✏️ 改、🗑 忘掉，
  走 `POST /api/profile`）；有關鍵字時只顯示有關的記憶，另外列出「聊過的話」（`GET /api/memory/search`，停止打字 0.3 秒後查，關鍵字標黃）。
  打開時重抓一次 profile（背景記憶提取學到的新東西才看得到）。
- `PinField`＋`pinErrors.js`：重要操作前再輸入一次四位數密碼、把 `wrong_pin`／`too_many_attempts` 轉成 `t.lock` 的訊息。
- `api.js`：包裝 `window.fetch`，所有 `/api/*` 自動帶 token 與角色；`downloadFrom()` 用 fetch 下載檔案（匯出要帶 token，`<a href>` 做不到）。
- `palettes.js`：毛色 → CSS 變數（`--pal-top/bottom/mid/line`），兩隻角色都吃。全身角色的漸層 id 每個元件各自產生（選角色畫面同時有好幾隻）。
- `BaseDialog`：遮罩、✕、Esc、`role="dialog"`、焦點移入；窄於 520px 變成底部面板。
- `SeasonDecor`／`ParticleLayer`：節日飄落物與角落擺飾；升級彩帶也用 `ParticleLayer`；尊重「減少動態效果」。

### 5.4 多語言（`i18n.js`）

- `STRINGS.zh`／`STRINGS.ja` 結構必須完全一樣（有測試）。要加語言：在 `LANGUAGES` 加代碼、補一份同結構的字典。
- 提到角色名字一律寫 `{name}`；`getStrings(lang, companionName)` 會把整份（含巢狀、陣列、函式回傳值）替換。
- App.vue 有兩個語言：`language`（介面，`t` 字典）與 `voiceLanguage`（＝`profile.language`，`vt` 字典，只用在語音辨識／朗讀語言、試聽句子、聲音清單）。
  🌐 只切介面（`<html lang>` 跟著換，日文用日文字型），存成這個角色的 `uiLanguage`；說話的語言不會變。

### 5.5 版面（RWD）

**上方按鈕分兩群**：功能類（天氣、🔮 占卜、💝 記得的事、📔 日記）｜設定類（🌐 介面語言、🔊 聲音、💭 泡泡、⚙️ 設定）。
設定類按鈕在 App.vue 的 `settingButtons` 定義一次，三處共用（攤開、收合選單、量寬度的隱藏複本 `.measure`）。
`fitTopBar()`（ResizeObserver＋resize）：標題至少 110px＋警告＋功能類＋設定類全部攤開的寬度 > 上方列寬度 → 設定類收進 🎛️，
按了在下面展開（`.setting-menu-pop`，絕對定位，不推動角色）；點外面或 Esc 收起、按 ⚙️ 也會收起。
有狀況時（模型不能用、連不上伺服器）上方列只顯示一個**紅色三角形驚嘆號**（`.warn-btn`，會輕輕跳動），按一下才在下面顯示訊息（`.warn-pop`）；
點外面或 Esc 收起，狀況解除時驚嘆號跟訊息一起消失。

規則在 `styles.css` 最後。直式單欄（最寬 480px）；寬螢幕（≥880px 且橫向）兩欄：左角色、右整欄聊天；
≤420px 精簡上方列；高度 ≤640px 縮小按鈕與聊天區。角色大小只由 `.app-root` 的 `--avatar-size` 決定。

---

## 6. 啟動、關閉、部署

### 6.1 `start-pokkatomo.command`（使用者雙擊）

1. 找 Node.js（沒有就跳提示）；向 `config.js` 取 PORT。
2. 沒有 `node_modules`，或 `package.json` 比上次安裝新 → `npm install`（已經裝過但這次失敗，例如沒網路 → 繼續用舊的）。
3. 沒有建置產物，或 `web/`、`vite.config.js`、`package.json` 有比 `server/public/index.html` 新的檔案 → `npm run build`。
4. `scripts/stop-server.sh`：只關掉「確定是 `server/server.js`」的舊行程（先 SIGTERM，2 秒後 kill -9）；port 被別的程式佔用就跳提示、不亂殺。
5. `POKKATOMO_OPEN_BROWSER=0` 啟動伺服器（`nohup`，終端機輸出寫到 `pokkatomo.log`，每次啟動覆蓋；持久的紀錄在 `server/data/logs/`），
   每 0.5 秒問 `http://127.0.0.1:PORT/api/health`，好了才開瀏覽器（只開一個分頁）：
   **有 Google Chrome 就用 Chrome 開**（`/Applications`、`~/Applications`，再用 `mdfind` 找 bundle id；
   不用 `osascript 'id of application'`，沒裝時會跳「找不到應用程式」視窗），沒有才用預設瀏覽器。
   15 秒內沒起來就跳提示並印出 log 最後幾行。

`stop-pokkatomo.command`：呼叫同一個 `stop-server.sh`。

**登入時自動打開**：雙擊 `autostart-on.command` 一次，用 AppleScript（System Events）把 `start-pokkatomo.command` 加進 macOS 的
登入項目（`hidden:true`，終端機不跳到前面）；以後登入時就會跑一次啟動檔（照常檢查更新、重建、打開 Chrome）。
第一次會問「終端機想要控制 System Events」要按「好」。`autostart-off.command` 移除；系統設定 → 一般 → 登入項目 也看得到。
**不用 LaunchAgent**：專案在「文件」資料夾，macOS 的隱私保護不讓背景服務讀「文件」（Operation not permitted），
透過終端機執行的登入項目才有權限。

所有 `.command` 檔都需要執行權限（`chmod 755`）。

### 6.2 更新到使用者的 Mac

- 只複製改過的程式檔，**絕對不要覆蓋 `server/data/`**（使用者的資料）。
- 同步後要比對雙方的 md5（曾經發生同步工具回報成功、檔案其實沒變的情況），並確認 `.command` 的執行權限還在
  （同步工具會把權限弄掉）。啟動檔會自動偵測更新並重建前端，不需要手動清 `server/public`。
- 打包整份給新電腦：`npm run bundle`（排除 `node_modules`、聊天紀錄、日記、角色狀態、封存、備份、紀錄檔、暫存／壞檔備份、`tests/`；
  現在整個 `server/data/` 都不打包，對方第一次打開會先設密碼、再自己新增第一個角色）。

---

## 7. 開發

```bash
npm install
npm start           # 後端（吃 server/public 的建置結果）
npm run dev         # 前端開發模式（5173 port，/api proxy 到 127.0.0.1:PORT），另外要開 npm start
npm run build       # 建置前端到 server/public
npm test            # 自動測試
npm run bundle      # 打包 zip
```

沒有 Mac／Apple Intelligence 時：用假的 `fm`（`FM_BIN=/path/to/fake`，參考 `tests/helpers/fakeFm.cjs`）。

---

## 8. 自動測試

`npm test`（Node 內建 `node --test`，Node 20 以上，**零額外套件**），約 190 個測試；
`npm run test:coverage` 看覆蓋率。測試資料夾叫 `tests/`（不是 `test/`：node 會把 `test/` 底下每個 JS 都當測試跑）。

- `tests/helpers/env.js`：每個測試檔建暫存資料夾（`POKKATOMO_DATA_DIR`），**不會碰到真正的資料**；
  必須在 import `server/` 之前呼叫（config 在載入時讀環境變數）。
- `tests/helpers/fakeFm.cjs`：假的 `fm`，測試中用 JSON 行為檔改行為（回覆內容、依呼叫種類回覆、失敗、延遲、不可用），
  每次呼叫都記錄（可以檢查 prompt 內容）。
- 每個測試檔是獨立行程，模組層級的快取（fm 可用狀態、天氣快取）不會互相影響。
- 涵蓋：`tests/lib/*`（純函式）、各 service、`tests/api*.test.js`（用 `createApp()` 起真的 app 打全部 API；
  Host 檢查用 `http.request`，因為 fetch 會忽略自訂 Host）、`tests/web/*`（字典結構、`{name}`、前後端清單一致、
  composable 邏輯，用 mock timers 測計時）。
- **沒有自動化**：畫面本身。每次改前端都用 Playwright（開發環境的 Chromium）寫一次性腳本檢查，不放進 `npm test`
  （要下載瀏覽器，不適合放在使用者電腦）。沒有 WebKit，所以 Safari 特有的問題測不到。

---

## 9. 已知限制與待決定事項

- **沒有在真的 Apple Foundation Models 上跑過**：`fm` 的 CLI 參數、錯誤訊息格式、模型會不會乖乖加 `[mood:xxx]`、
  日記／問候／占卜的品質、中日文的 token 數，全部只用假模型驗證過程式邏輯。
- **RAG 是關鍵字檢索**：詞完全不同就找不到（拉麵／ラーメン、肚子餓／想吃東西）。下一步可以：記憶提取時請模型
  同時產生中日文關鍵字存進封存；或加本機多語言 embedding（要下載 100MB 以上的模型）。門檻（`RAG_MIN_SCORE`）
  是用少量範例調的，真的累積資料後要看紀錄檔的 `rag_recall` 再調。
- **封存是 JSONL 不是 SQLite**：一年幾 MB、全部讀進記憶體沒問題；十年後如果太大再換（只要換 `archiveService.js`）。
- **自動備份跟資料在同一台電腦**：電腦壞掉要靠「匯出所有資料」存到別處，新電腦用「匯入備份」還原。
- **手機連線要先裝憑證**：每台 iPhone／iPad 第一次要用 Safari 安裝並信任「PokkaTomo Home CA」；Mac 的資料被整個清掉（`tls/` 不見）時 CA 會換新，手機要重裝。
  手機語音輸入需要 Mac 上有 Xcode 指令列工具（編譯 `speech.swift`），並在 Mac 上允許語音辨識。`speech.swift` 在開發用的 Linux 環境編不了，只能在 Mac 上驗證。
- **全身角色**只有正面，沒有轉身、沒有骨架動畫；背（`back`）點不到。
- **密碼是防君子**：資料檔沒加密；token 在伺服器記憶體，重開就要重新輸入。忘記密碼要開發者刪 `security.json`。
- 刪除角色是真的刪（連每日備份裡的也刪），無法復原。
- 換季服裝、吃東西、跳舞只有全身角色有；舊版圓圓的角色沒有。
- **鬧鐘／提醒**：網頁要開著才有用，還沒做。
- **Safari**：語音辨識不穩；版面只在 Chromium 測過。
- **農曆節日**資料到 2099 年（`lib/lunarData.js`）。試過改用 JS 內建的 Intl 農曆，但 ICU 在 2027、2030 年春節差一天，所以用產生的資料。
- **日文文案**沒有母語者校對。
- 啟動檔會優先用 Chrome，但使用者如果自己用 Safari 打開網址還是可以用（語音輸入可能不行）。
