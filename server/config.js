// config.js
// 所有環境變數集中在這一個檔案讀取，其他程式一律 import 這裡的常數，
// 不要在別的檔案裡散落 `process.env.X`。
//
// 好處：(1) 想知道「這個專案吃哪些環境變數」，看這個檔案就好，不用整個專案搜尋；
//       (2) 之後要加新設定、改預設值、加驗證，只需要改這一個地方。

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

export const PORT = Number(process.env.PORT || 3000);

// 資料檔（聊天紀錄、設定、日記、角色狀態）放在哪個資料夾。平常就是 server/data；
// 自動測試會把它指到暫存資料夾，才不會蓋掉使用者真正的資料。
// ★ 保護使用者的資料：跑自動測試（node --test 會設 NODE_TEST_CONTEXT）但沒指定資料夾時，一律改用暫存資料夾。
//   以前有幾個測試檔沒有呼叫 setupTestEnv()，在使用者的 Mac 上跑 npm test 時，測試故意製造的錯誤被寫進了真正的紀錄檔。
export const RUNNING_TESTS = process.env.NODE_TEST_CONTEXT != null;
export const DATA_DIR =
  process.env.POKKATOMO_DATA_DIR ||
  (RUNNING_TESTS
    ? path.join(os.tmpdir(), `pokkatomo-test-default-${process.pid}`)
    : path.join(path.dirname(fileURLToPath(import.meta.url)), 'data'));

// 伺服器啟動後要不要自己打開瀏覽器。直接 `npm start` 時預設會開（方便開發）；
// start-pokkatomo.command 會設成 0，改由它確認伺服器真的準備好之後再開——
// 以前兩邊都會開，每次雙擊都跑出兩個一模一樣的分頁。
export const OPEN_BROWSER = process.env.POKKATOMO_OPEN_BROWSER !== '0';

// 允許用環境變數覆寫執行檔名稱，方便未來替換成別的本地端 LLM 執行檔，
// 或在無法使用真的 `fm` 的機器上換成假腳本做測試。
export const FM_BIN = process.env.FM_BIN || 'fm';
export const FM_TIMEOUT_MS = Number(process.env.FM_TIMEOUT_MS || 30000);
export const FM_AVAILABLE_CHECK_TIMEOUT_MS = 5000;

// 設成任何非空值都會關掉「關鍵記憶提取」的背景 fm 呼叫（例如那台 Mac 效能有限）。
export const DISABLE_FACT_EXTRACTION = Boolean(process.env.DISABLE_FACT_EXTRACTION);

// 「最近的對話」最多讀幾則（寫日記、主動問候要看今天聊過什麼；從對話檔讀，不另外存一份）。
export const HISTORY_MAX_STORED_MESSAGES = 600;
export const HISTORY_CONTEXT_LIMIT = 20; // 每次組 prompt 時，帶多少則最近歷史當上下文
export const HISTORY_FM_CONTEXT_TURNS = 8; // fmRespond 實際折進 prompt 裡的最近幾輪

export const PROFILE_MAX_PREFERENCES = 30; // 記憶提取後，喜好清單最多保留幾筆

// /api/chat 的訊息長度上限。express.json() 只擋整個 request body 超過 1MB，
// 對單一欄位沒有合理上限——沒有這個檢查的話，使用者（或未來任何呼叫這個
// API 的東西）貼一大段文字進來，會整段被塞進 fm 的 prompt 裡，浪費資源、
// 拖慢回應，甚至可能讓 fm 逾時。500 字對聊天訊息來說已經很寬鬆了。
export const MESSAGE_MAX_LEN = 500;

// 所有「使用者可以輸入的欄位」的字數上限，只在這裡定義一次：
// 後端用它擋／截斷，前端透過 GET /api/config 拿到同一份來設定輸入框的 maxlength。
// 以前前端寫死在 .vue 裡、後端另外寫在 profileService.js，兩邊數字不一樣（例如暱稱前端 20、後端 40）。
export const LIMITS = Object.freeze({
  message: MESSAGE_MAX_LEN,
  nickname: 20,
  companionName: 20,
  persona: 150,
  preference: 40,
  preferencesCount: 50,
  anniversaryName: 40,
  anniversariesCount: 50,
  city: 60
});

// 日記（見 diaryService.js）
export const DIARY_BACKFILL_DAYS = 3; // 有幾天沒開的話，最多往回補寫幾天
export const DIARY_MEMORY_DAYS = 3; // 最近幾篇日記放進 prompt 當「中期記憶」
export const DIARY_MAX_ENTRIES = 3650; // diary.json 最多留幾篇（十年份；一篇才幾百字，日記是回憶，不該一年就刪）

// 主動問候（見 greetService.js）：使用者這麼多分鐘內才剛講過話，就不要再主動打招呼（正在聊天中）。
export const GREET_QUIET_AFTER_CHAT_MIN = 20;

// 天氣（見 weatherService.js）。預設用 Open-Meteo（免費、不用 API key）；網址可以用環境變數換掉，
// 測試時可以指到本機假的伺服器。
export const WEATHER_API_BASE = process.env.WEATHER_API_BASE || 'https://api.open-meteo.com';
export const GEOCODE_API_BASE = process.env.GEOCODE_API_BASE || 'https://geocoding-api.open-meteo.com';
export const WEATHER_TIMEOUT_MS = 5000; // 單次網路請求最多等多久
export const WEATHER_CACHE_MIN = 30; // 天氣快取多久才重抓
export const WEATHER_STALE_MAX_MIN = 180; // 快取舊到多久以內還可以先拿來用（同時背景重抓）
export const WEATHER_PROMPT_WAIT_MS = 2500; // 聊天時完全沒快取的話，最多為了天氣多等多久

// 成長／親密度（見 companionService.js）。只加不扣，每天有上限，避免狂點刷等級。
export const GROWTH_LEVELS = [0, 30, 100, 250, 500, 1000]; // 第 1～6 級需要的累積點數
export const GROWTH_CHAT_POINT_DAILY_CAP = 30; // 每則訊息 +1，一天最多 30
export const GROWTH_PAT_POINT_DAILY_CAP = 10; // 每次摸頭 +1，一天最多 10
export const GROWTH_FIRST_VISIT_BONUS = 3; // 每天第一次聊天 +3
export const GROWTH_STREAK_BONUS = 2; // 連續第二天以上再 +2

// 說「我出門了」之後，超過這麼多小時還沒說回來，就當作忘記說，不再說「歡迎回來，出去了 N 小時」。
export const AWAY_MAX_HOURS = 18;

// 好幾天沒來時，主動問候會先表達想念（見 greetService.js）
export const MISSED_YOU_AFTER_DAYS = 2;

// Prompt 長度預算（見 fmService.js）。Apple Foundation Models 的上下文只有 4096 tokens（輸入＋輸出一起算），
// 中日文大約一個字一個 token 以上。以前最壞情況（很長的個性描述＋三篇日記＋連續幾則 500 字的訊息）
// 會超過六千字，模型直接報錯、使用者只看到「沒辦法回答」。現在各部分都有上限，而且超過時會自動用精簡版重試一次。
export const PROMPT_HISTORY_BUDGET_CHARS = 900; // 折進訊息裡的最近對話，總共最多幾個字
export const PROMPT_HISTORY_ENTRY_MAX = 200; // 其中每一則最多幾個字
export const PROMPT_MEMORY_ENTRY_MAX = 120; // 每篇日記放進 prompt 時最多幾個字
export const PROMPT_LIST_MAX_CHARS = 200; // 喜好、紀念日清單各自最多幾個字

// 伺服器只聽這台電腦自己（127.0.0.1）。以前是 Express 預設的「所有網路介面」：在咖啡廳之類的公共 Wi-Fi，
// 同一個網路的人打 http://<她的 IP>:3000 就能看到聊天紀錄、日記、設定，macOS 還會跳出
// 「是否允許傳入連線」的視窗讓她困惑。之後真的要讓手機連進來，再改這裡（並且要加密碼）。
export const HOST = process.env.HOST || '127.0.0.1';

// ---------- 永久保存、備份、紀錄 ----------
// 對話存在每個角色的 conversations/YYYY-MM.jsonl（一行一則，只加不改），資料夾結構見 lib/characterContext.js。
// 自動備份：每天第一次用到時把 app/ 跟 characters/ 整個複製一份。
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const BACKUP_KEEP = 14; // 最多留幾份（幾天）
// 紀錄檔（錯誤、重要事件；不記對話內容）：logs/YYYY-MM-DD.log，一行一筆 JSON。
export const LOG_DIR = path.join(DATA_DIR, 'logs');
export const LOG_KEEP_DAYS = 30;

// ---------- 輕量 RAG（見 ragService.js） ----------
export const RAG_TOP_K = 3; // 每次最多想起幾件舊事
export const RAG_ENTRY_MAX = 110; // 每件放進 prompt 最多幾個字
export const RAG_MIN_SCORE = 1.2; // BM25 分數門檻：太低代表只是碰巧有一兩個常見字，不要硬扯
export const RAG_RELATIVE_MIN = 0.5; // 也要有第一名分數的一半以上（第二、三名跟第一名差太多就不帶）
export const RAG_MIN_MESSAGE_LEN = 4; // 太短的訊息（嗯、好）不搜尋

