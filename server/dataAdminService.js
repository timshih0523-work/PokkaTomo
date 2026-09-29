// dataAdminService.js
// 會「整批動到資料檔」的操作：刪除角色、匯入備份。兩個都要先在前端再輸入一次密碼（routes 裡 verifyPin）。
//
//   - 刪除角色：**真的刪掉**（開發者決定：刪了就算了）。整個角色資料夾刪除，每日備份裡那個角色的資料也一起刪，無法復原。
//   - 匯入備份：先把「現在的資料」整份搬到 server/data/backups/before-import-<日期時間>/，再放進 zip 裡的資料
//     （2026-09 以前匯出的舊結構 zip 先用 lib/layoutV1.js 轉成新結構）。
// 每日備份在 backups/daily/，自動清理只清那裡，不會刪到 before-import-*。
// 動完之後清掉記憶體快取（lib/cacheRegistry.js），不然 RAG 索引等還會用舊資料。

import { mkdir, readdir, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';

import { DATA_DIR, BACKUP_DIR } from './config.js';
import { removeCharacter } from './characterService.js';
import { CHARACTERS_DIR, isValidCharacterId } from './lib/characterContext.js';
import { convertV1, isV1Layout } from './lib/layoutV1.js';
import { resetCaches } from './lib/cacheRegistry.js';
import { readZip } from './lib/zip.js';
import { log } from './lib/logger.js';
import { assertDataHome } from './lib/dataHome.js';
import { AppError, BadRequestError } from './lib/errors.js';

const pad = (n) => String(n).padStart(2, '0');
function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 刪除角色：從清單拿掉，資料夾整個刪除（連每日備份裡的也刪），無法復原。
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function deleteCharacter(id) {
  if (!isValidCharacterId(id)) throw new BadRequestError('角色不存在');
  assertDataHome();
  const removed = await removeCharacter(id);
  if (!removed) throw new AppError('角色不存在', { status: 404, code: 'not_found' });

  await rm(path.join(CHARACTERS_DIR, id), { recursive: true, force: true });
  // 每日備份裡的這個角色也刪掉（不然之後新角色用到同一個編號時，舊備份會混在一起，也不算真的刪掉）
  let dailies = [];
  try {
    dailies = await readdir(path.join(BACKUP_DIR, 'daily'));
  } catch {
    /* 還沒有每日備份 */
  }
  for (const day of dailies) {
    await rm(path.join(BACKUP_DIR, 'daily', day, 'characters', id), { recursive: true, force: true });
  }
  resetCaches(id);
  log.info('character_deleted', { id });
  return { id, name: removed.name };
}

// 同一秒做兩次（例如連按）時資料夾名稱不要撞到：後面加 -2、-3…
async function uniqueDir(base) {
  let p = base;
  for (let i = 2; await exists(p); i++) p = `${base}-${i}`;
  return p;
}

// ---- 匯入備份 ----

// zip 裡「data/」底下可以放回去的檔案（其他都忽略）。密碼（security.json）不匯入：密碼維持現在這台的。
// 新結構：app/characters.json、characters/<編號>/{character,user,state,diary}.json、characters/<編號>/conversations/YYYY-MM.jsonl
// 舊結構（2026-09 以前匯出的）：最上層 *.json、archive/*.jsonl、characters/<id>/*.json、characters/<id>/archive/*.jsonl → 匯入時轉成新結構
const V2_RE = [
  /^app\/characters\.json$/,
  /^characters\/[a-z0-9-]{1,40}\/(character|user|state|diary)\.json$/,
  /^characters\/[a-z0-9-]{1,40}\/conversations\/\d{4}-\d{2}\.jsonl$/
];
const V1_RE = [
  /^[A-Za-z0-9_-]+\.json$/,
  /^archive\/\d{4}-\d{2}\.jsonl$/,
  /^characters\/[a-z0-9-]{1,40}\/[A-Za-z0-9_-]+\.json$/,
  /^characters\/[a-z0-9-]{1,40}\/archive\/\d{4}-\d{2}\.jsonl$/
];
const isSecurity = (rel) => rel === 'security.json' || rel === 'app/security.json';

/** 從 zip 的檔案清單挑出要還原的資料（相對 DATA_DIR 的路徑）。不合規則的路徑一律忽略（防 ../ 之類）。 */
export function pickRestorableFiles(entries) {
  const files = [];
  for (const e of entries) {
    const m = /^(?:[^/]+\/)?data\/(.+)$/.exec(e.name.replace(/\\/g, '/'));
    if (!m) continue;
    const rel = m[1];
    if (rel.split('/').some((seg) => seg === '..' || seg === '')) continue;
    if (isSecurity(rel)) continue;
    if (![...V2_RE, ...V1_RE].some((re) => re.test(rel))) continue;
    files.push({ rel, data: e.data });
  }
  return files;
}

/**
 * 匯入「匯出所有資料」產生的 zip：現在的資料先整份搬到 backups/before-import-…/，再放進 zip 的資料。
 * @param {Buffer} buffer
 * @returns {Promise<{ files: number, characters: number, previousMovedTo: string }>}
 */
export async function importBackup(buffer) {
  assertDataHome();
  let entries;
  try {
    entries = readZip(buffer);
  } catch (err) {
    throw new AppError(`讀不到這個檔案：${err.message}`, { status: 400, code: 'bad_zip' });
  }
  let files = pickRestorableFiles(entries);
  const map = Object.fromEntries(files.map((f) => [f.rel, f.data]));
  if (isV1Layout(map)) {
    // 舊版匯出的 zip：先轉成新結構
    try {
      files = Object.entries(convertV1(map).files).map(([rel, content]) => ({ rel, data: Buffer.from(content, 'utf-8') }));
    } catch (err) {
      throw new AppError(`備份檔壞掉了，沒有匯入：${err.message}`, { status: 400, code: 'bad_backup' });
    }
    files = files.filter((f) => !isSecurity(f.rel));
  } else {
    files = files.filter((f) => V2_RE.some((re) => re.test(f.rel)));
  }
  if (!files.some((f) => f.rel.endsWith('/character.json'))) {
    throw new AppError('這不是 PokkaTomo 匯出的備份檔', { status: 400, code: 'not_backup' });
  }
  // 內容先檢查一遍：JSON 要能解析，壞掉的就整個不匯入（不要換到一半）
  for (const f of files) {
    if (!f.rel.endsWith('.json')) continue;
    try {
      JSON.parse(f.data.toString('utf-8'));
    } catch {
      throw new AppError(`備份檔裡的 ${f.rel} 壞掉了，沒有匯入`, { status: 400, code: 'bad_backup' });
    }
  }

  // 1. 現在的資料搬走（backups、logs、密碼、手機連線的憑證 tls/ 留在原地）
  const target = await uniqueDir(path.join(BACKUP_DIR, `before-import-${stamp()}`));
  await mkdir(target, { recursive: true });
  for (const name of await readdir(DATA_DIR)) {
    if (name === 'backups' || name === 'logs' || name === 'tls') continue;
    if (name === 'app') {
      for (const f of await readdir(path.join(DATA_DIR, 'app'))) {
        if (f === 'security.json') continue;
        await mkdir(path.join(target, 'app'), { recursive: true });
        await rename(path.join(DATA_DIR, 'app', f), path.join(target, 'app', f));
      }
      continue;
    }
    await rename(path.join(DATA_DIR, name), path.join(target, name));
  }

  // 2. 放進 zip 裡的資料
  for (const f of files) {
    const dest = path.join(DATA_DIR, f.rel);
    if (!dest.startsWith(DATA_DIR + path.sep)) continue; // 保險
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, f.data);
  }

  resetCaches(null);
  let characters = 1;
  try {
    const list = JSON.parse(files.find((f) => f.rel === 'app/characters.json')?.data.toString('utf-8') || '[]');
    if (Array.isArray(list) && list.length) characters = list.length;
  } catch {
    /* 上面檢查過了 */
  }
  const previousMovedTo = path.relative(DATA_DIR, target);
  log.info('backup_imported', { files: files.length, characters, previousMovedTo });
  return { files: files.length, characters, previousMovedTo };
}
