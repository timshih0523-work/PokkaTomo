// dataHome.js
// 專案資料夾在伺服器還開著的時候被改名／搬走（例如把專案資料夾改成新名字）：
// 還在跑的舊伺服器記著的是「舊的絕對路徑」，如果照樣 mkdir -p 寫檔，就會在原地憑空長出一個
// 只有 server/data/logs 的舊名字資料夾（2026-09-29 真的發生過：舊伺服器被新的啟動檔關掉時寫了一行 server_stop）。
//
// 規則：server/data 的上一層（server/）不存在，就代表整個專案被搬走了——
//   - 不寫任何檔案（紀錄檔直接略過、其他寫入丟錯誤），不建立任何資料夾
//   - 這個伺服器已經沒有用了，印出提示後自己結束（測試時不結束）
// 全新安裝時 server/data 還不存在沒關係：server/ 在，就照常建立。

import { existsSync } from 'fs';
import path from 'path';

import { DATA_DIR, RUNNING_TESTS } from '../config.js';

const HOME = path.dirname(DATA_DIR);
let exiting = false;

/** 專案資料夾還在原本的位置嗎？ */
export function dataHomeExists() {
  if (existsSync(HOME)) return true;
  if (!exiting && !RUNNING_TESTS) {
    exiting = true;
    console.error(`[data_home_missing] 找不到 ${HOME}（專案資料夾被改名或搬走了），這個舊的伺服器不再寫入任何檔案、馬上結束。請用新位置的啟動檔重新打開。`);
    setTimeout(() => process.exit(1), 200).unref();
  }
  return false;
}

/** 寫檔前呼叫：專案資料夾不見了就丟錯誤，不要在舊位置建出新資料夾。 */
export function assertDataHome() {
  if (!dataHomeExists()) {
    const err = new Error('專案資料夾被移動了，沒有寫入');
    err.code = 'data_home_missing';
    throw err;
  }
}
