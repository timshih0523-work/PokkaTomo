// server.js
// 啟動入口：用 app.js 組好的 Express app 開始監聽、做啟動時的背景工作（檢查 fm、補寫日記）、
// 視情況開瀏覽器、處理關閉訊號。app 本身怎麼組裝（路由、錯誤處理、安全檢查）在 app.js。
//  - 全部只佔用一個 port（預設 3000）
//
// 使用方式：
//   npm run build   # 先把 web/ 編譯進 server/public
//   npm start        # 啟動這個檔案
// 或直接雙擊 start-pokkatomo.command（會自動做上面兩件事）。
//
// 這個檔案刻意保持很薄：路由邏輯在 routes/，環境變數在 config.js，
// fm 狀態快取邏輯在 fmService.js。之後要加新功能，多半是加一個新的 routes/*.js，
// 很少需要回來改這裡。

import { exec } from 'child_process';

import { PORT, HOST, OPEN_BROWSER } from './config.js';
import { createApp } from './app.js';
import { primeFmStatus } from './fmService.js';
import { backfillPastDiaries } from './diaryService.js';
import { drainAll } from './lib/asyncQueue.js';
import { log, pruneLogs } from './lib/logger.js';
import { runDailyBackup } from './backupService.js';
import { listCharacters } from './characterService.js';
import { withCharacter } from './lib/characterContext.js';
import { setLanAppFactory, startLanIfEnabled, stopLan } from './lanService.js';

const app = createApp();

// 啟動時先確認一次 fm 可不可以用（結果會被 fmService 快取起來，之後 /api/health、
// /api/chat 都透過 getFmStatus() 讀同一份快取，不用等這個 Promise 完成才開始聽 port）。
// fm 可以用的話，順便在背景把「有聊天但還沒寫日記」的前幾天補寫起來（見 diaryService.js）。
// 每個角色都要補寫（見 lib/characterContext.js：不在請求裡的工作要自己指定角色）
const forEachCharacter = async (fn) => {
  for (const c of await listCharacters()) await withCharacter(c.id, fn);
};

primeFmStatus().then((status) => {
  if (status.available) {
    forEachCharacter(() => backfillPastDiaries()).catch((err) => log.warn('diary_backfill_failed', { error: err.message }));
  }
});

// 啟動時的整理工作（都在背景、失敗不影響啟動）：
//   今天的自動備份，然後清掉太舊的紀錄檔。
runDailyBackup()
  .then(() => pruneLogs())
  .catch((err) => log.error('startup_housekeeping_failed', { error: err.message }));

// 只聽 127.0.0.1（這台電腦自己），見 config.js 的 HOST 說明。
const server = app.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n🐵 PokkaTomo 已經啟動：${url}\n`);
  log.info('server_start', { port: PORT, node: process.version, platform: process.platform });

  // 手機／平板連線：上次有打開就照開（見 lanService.js）
  setLanAppFactory(() => createApp({ lan: true }));
  startLanIfEnabled().catch((err) => log.error('lan_start_failed', { error: err.message }));

  // start-pokkatomo.command 會自己在確認伺服器準備好之後開瀏覽器（見 config.js 的 OPEN_BROWSER），
  // 這裡只在直接 `npm start` 時才開，避免一次雙擊跑出兩個分頁。
  if (!OPEN_BROWSER) return;

  // 用系統指令自動打開瀏覽器；macOS 用 open，順便相容 Windows/Linux 以防萬一。
  const openCommand =
    process.platform === 'darwin' ? `open ${url}` : process.platform === 'win32' ? `start ${url}` : `xdg-open ${url}`;
  exec(openCommand, (err) => {
    if (err) {
      console.warn('無法自動打開瀏覽器，請手動到瀏覽器輸入：', url);
    }
  });
});

// 優雅關閉：start-pokkatomo.command / stop-pokkatomo.command 會先送 SIGTERM，
// 這裡先停止接新請求、等正在排隊的 JSON 寫入做完再結束，不要在寫檔寫到一半時被砍掉。
// 最多等 1.5 秒（啟動檔給 2 秒才會 kill -9），時間到就直接結束。
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] PokkaTomo 正在關閉…`);
  log.info('server_stop', { signal });
  server.close();
  stopLan();
  const forceExit = setTimeout(() => process.exit(0), 1500);
  drainAll().finally(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
