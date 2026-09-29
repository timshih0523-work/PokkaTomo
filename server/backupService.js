// backupService.js
// 自動備份：每天第一次用到 PokkaTomo（伺服器啟動、或第一次聊天）時，把整個資料夾
// （app/：密碼、角色清單；characters/：每個角色的設定、對話、日記、狀態）複製到 server/data/backups/daily/YYYY-MM-DD/，
// 保留最近 BACKUP_KEEP 份。
//
// 她不會自己備份。這份備份主要防的是「檔案被弄壞／被誤刪／程式 bug 寫錯資料」——
// 可以回到前幾天的樣子。防不了整台電腦壞掉，那個要靠設定面板的「匯出所有資料」存到別的地方。
// 她不一定每天都開，所以是「用到的那天」才備份，不是固定排程。

import { cp, mkdir, readdir, rename, rm, stat } from 'fs/promises';
import path from 'path';

import { BACKUP_DIR, BACKUP_KEEP } from './config.js';
import { CHARACTERS_DIR, APP_DIR } from './lib/characterContext.js';
import { enqueue } from './lib/asyncQueue.js';
import { log } from './lib/logger.js';
import { dataHomeExists } from './lib/dataHome.js';
import { localDateKey } from './lib/time.js';

let lastBackupDay = null;

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// 每日備份放在 backups/daily/YYYY-MM-DD/（裡面是 app/ 跟 characters/ 的完整複本）。
// backups/ 底下其他資料夾（deleted-characters/、before-import-*/、before-migrate-*/）是重要操作前留的，不會被自動清掉。
export const DAILY_DIR = path.join(BACKUP_DIR, 'daily');

/**
 * 今天還沒備份的話備份一次。
 * @returns {Promise<string|null>} 備份資料夾路徑；今天已經備份過或沒有資料時回傳 null
 */
export function runDailyBackup(now = new Date()) {
  const day = localDateKey(now);
  if (lastBackupDay === day) return Promise.resolve(null);
  return enqueue('backup', async () => {
    if (lastBackupDay === day) return null;
    const target = path.join(DAILY_DIR, day);
    if (await exists(target)) {
      lastBackupDay = day;
      return null;
    }
    if (!dataHomeExists()) return null; // 專案資料夾被搬走了
    const hasApp = await exists(APP_DIR);
    const hasCharacters = await exists(CHARACTERS_DIR);
    if (!hasApp && !hasCharacters) return null; // 還沒有任何資料（第一次開）

    const tmp = `${target}.tmp-${process.pid}`;
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    if (hasApp) await cp(APP_DIR, path.join(tmp, 'app'), { recursive: true });
    if (hasCharacters) await cp(CHARACTERS_DIR, path.join(tmp, 'characters'), { recursive: true });
    // 整份複製完才改名成正式名稱：複製到一半被關掉的話，不會留下一份看起來正常其實缺檔的備份。
    await rename(tmp, target);
    lastBackupDay = day;

    const removed = await pruneBackups();
    log.info('backup_done', { day, pruned: removed });
    return target;
  }).catch((err) => {
    log.error('backup_failed', { error: err.message });
    return null;
  });
}

/** 每日備份只留最新的 keep 份。 */
export async function pruneBackups(keep = BACKUP_KEEP) {
  let names;
  try {
    names = await readdir(DAILY_DIR);
  } catch {
    return 0;
  }
  const days = names.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  const old = days.slice(0, Math.max(0, days.length - keep));
  for (const d of old) await rm(path.join(DAILY_DIR, d), { recursive: true, force: true });
  // 上次沒複製完的暫存資料夾也清掉
  for (const n of names.filter((n) => n.includes('.tmp-'))) {
    await rm(path.join(DAILY_DIR, n), { recursive: true, force: true });
  }
  return old.length;
}

/** 給測試用：忘記「今天備份過了」。 */
export function _resetBackupMemo() {
  lastBackupDay = null;
}
