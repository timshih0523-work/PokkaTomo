// logger.js
// 紀錄檔：server/data/logs/YYYY-MM-DD.log，一行一筆 JSON，保留 LOG_KEEP_DAYS 天。
//
// 為什麼要有：使用者不懂技術，出問題時只會說「牠剛剛不講話了」。以前只有 console 輸出，
// 啟動檔把它寫進 pokkatomo.log，但每次重新啟動就被蓋掉、也沒有時間。現在錯誤、模型失敗／逾時、
// 花了多久、前端的錯誤都會留下來，開發者之後打開當天的檔案（或從匯出的 zip 裡）就能看。
//
// 刻意「不記對話內容」：對話本身已經永久存在 archive/，紀錄檔只放事件跟數字，
// 這樣把紀錄檔傳給別人幫忙除錯時，不會洩漏聊天內容。
//
// 用法：log.info('fm_ok', { ms: 1234 })、log.warn(...)、log.error('chat_failed', { error: err.message })

import { appendFile, mkdir, readdir, unlink } from 'fs/promises';
import path from 'path';

import { LOG_DIR, LOG_KEEP_DAYS } from '../config.js';
import { enqueue } from './asyncQueue.js';
import { localDateKey } from './time.js';
import { dataHomeExists } from './dataHome.js';

// 測試時不要把 info 印到終端機（太吵）；檔案一樣會寫（寫在測試的暫存資料夾）。
const QUIET_CONSOLE = process.env.NODE_TEST_CONTEXT != null || process.env.POKKATOMO_QUIET_LOG === '1';

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

/** 本地時間 2026-09-28 14:03:05.123（比 ISO 的 UTC 好讀，使用者的電腦在本地時區） */
function localStamp(d) {
  return `${localDateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

// 欄位裡的字串太長就截斷（例如錯誤訊息裡夾著整段 stderr），避免一行紀錄變成好幾 KB。
function tidy(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' && v.length > 300 ? `${v.slice(0, 300)}…` : v;
  }
  return out;
}

export function logFilePath(date = new Date()) {
  return path.join(LOG_DIR, `${localDateKey(date)}.log`);
}

function write(level, event, fields) {
  const now = new Date();
  const entry = { t: localStamp(now), level, event, ...tidy(fields) };
  if (level === 'error') console.error(`[${event}]`, fields ?? '');
  else if (level === 'warn') console.warn(`[${event}]`, fields ?? '');
  else if (!QUIET_CONSOLE) console.log(`[${event}]`, fields ?? '');

  const file = logFilePath(now);
  // 排隊寫：同一個檔案的 append 不會交錯。寫紀錄失敗絕對不能讓主要功能壞掉，所以吞掉錯誤。
  // 專案資料夾被搬走了（舊伺服器還在跑）：不要在舊位置建出 server/data/logs（見 dataHome.js）
  if (!dataHomeExists()) return Promise.resolve();
  return enqueue(file, async () => {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(file, `${JSON.stringify(entry)}\n`, 'utf-8');
  }).catch(() => {});
}

export const log = {
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields)
};

/** 刪掉超過保留天數的紀錄檔（啟動時呼叫一次）。 */
export async function pruneLogs(now = new Date(), keepDays = LOG_KEEP_DAYS) {
  let files;
  try {
    files = await readdir(LOG_DIR);
  } catch {
    return 0;
  }
  const cutoff = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - keepDays + 1));
  let removed = 0;
  for (const f of files) {
    const m = /^(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
    if (m && m[1] < cutoff) {
      await unlink(path.join(LOG_DIR, f)).catch(() => {});
      removed += 1;
    }
  }
  return removed;
}
