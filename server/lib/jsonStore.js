// jsonStore.js
// profileService / historyService 共用的「讀寫一個 JSON 檔」小工具。
//
// 為什麼要獨立出來：
//   1. 原子寫入（atomic write）：以前是直接 writeFile() 覆蓋原檔。寫到一半如果行程被砍掉
//      （start-pokkatomo.command 每次啟動都會 kill 舊的 server，等不到就 kill -9；或是 Mac
//      直接關機），檔案會只寫了一半，變成壞掉的 JSON。現在改成先寫到同資料夾的暫存檔、
//      再 rename 蓋過去——rename 在同一個磁碟上是原子操作，檔案永遠只會是「舊的完整版」
//      或「新的完整版」，不會有半截的狀態。
//   2. 壞檔不再「默默清空」：以前讀到壞掉的 JSON 會直接當成空的（聊天紀錄變 []、設定變預設值），
//      下一次存檔就把空的寫回去，使用者的暱稱、紀念日、學到的喜好全部永久消失。現在讀到壞檔
//      會先把它改名備份成 `<檔名>.corrupt-<時間>`，再用預設值繼續，至少資料還救得回來。
//   3. 兩個 service 原本各自寫了一份幾乎一樣的「檔案不存在就建立 / 解析失敗就用預設值」邏輯，
//      收在這裡只維護一份。

import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import { assertDataHome } from './dataHome.js';
import path from 'path';
import { log } from './logger.js';

/**
 * 讀取 JSON 檔。檔案不存在時回傳 fallback（不會自動建立檔案，第一次寫入時才建立）；
 * 內容壞掉時把壞檔備份起來，再回傳 fallback。
 * @param {string} filePath
 * @param {() => any} fallback 產生預設值的函式（每次都回傳新物件，避免共用同一個參考被改到）
 */
export async function readJson(filePath, fallback) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return fallback();
    throw err;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const backupPath = `${filePath}.corrupt-${Date.now()}`;
    try {
      await rename(filePath, backupPath);
      log.error('json_corrupt_backed_up', { file: path.basename(filePath), backup: path.basename(backupPath) });
    } catch (renameErr) {
      log.error('json_corrupt_backup_failed', { file: path.basename(filePath), error: renameErr.message });
    }
    return fallback();
  }
}

/**
 * 原子寫入 JSON 檔：先寫暫存檔，再 rename 蓋過原檔。
 * @param {string} filePath
 * @param {any} data
 */
export async function writeJsonAtomic(filePath, data) {
  assertDataHome(); // 專案資料夾被搬走了就不寫（不在舊位置長出新資料夾）
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmpPath, filePath);
  return data;
}
