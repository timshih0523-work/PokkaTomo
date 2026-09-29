// exportService.js
// 「匯出所有資料」：打包成一個 zip 讓使用者下載，存到隨身碟、雲端硬碟都可以。
// 自動備份（backupService.js）跟資料在同一台電腦上，電腦壞了就一起沒了；這個才是真正的異地備份。
//
// zip 裡有兩種東西：
//   1. 給人看的：對話紀錄.txt、日記.txt（直接打開就能讀、能搜尋）
//   2. 原始資料：data/ 底下的 JSON 與 archive/*.jsonl，原封不動——要還原就放回 server/data/
//   另外附最近的紀錄檔（logs/），出問題時可以整包交給開發者。

import { readFile, readdir } from 'fs/promises';
import path from 'path';

import { LOG_DIR } from './config.js';
import { readArchive } from './archiveService.js';
import { listCharacters, characterNameOf } from './characterService.js';
import { withCharacter, CHARACTERS_DIR, APP_DIR } from './lib/characterContext.js';
import { getDiaries } from './diaryService.js';
import { getProfile, companionNameOf } from './profileService.js';
import { createZip } from './lib/zip.js';
import { localDateKey } from './lib/time.js';
import { log } from './lib/logger.js';

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 對話紀錄的純文字版：依日期分段。 */
export function formatTranscript(records, { userName, companionName }) {
  const out = [];
  let day = null;
  for (const r of records) {
    const d = new Date(r.ts);
    const key = localDateKey(d);
    if (key !== day) {
      if (day) out.push('');
      out.push(`==== ${key} ====`);
      day = key;
    }
    const who = r.role === 'user' ? userName : companionName;
    const tag = r.kind === 'fortune' ? '（今日占卜）' : r.proactive ? '（主動問候）' : '';
    out.push(`[${hhmm(d)}] ${who}${tag}：${r.content}`);
  }
  return out.join('\n');
}

function formatDiaries(entries) {
  return [...entries]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) => `==== ${e.date} ====\n${e.text}`)
    .join('\n\n');
}

const README = `PokkaTomo 匯出資料 / データのエクスポート

■ 直接看（每個角色一個資料夾）
  <角色名字>/對話紀錄.txt ：所有聊過的話（依日期）
  <角色名字>/日記.txt     ：角色寫的日記

■ 還原（給開發者）
  在 PokkaTomo 的「設定 → 匯入備份」選這個 zip 就能還原（或把 data/ 裡的東西放回 server/data/）。
  data/app/characters.json      角色清單（編號＋名字）
  data/app/security.json        密碼（雜湊，看不出密碼本身；匯入時不會蓋掉現在的密碼）
  data/characters/<編號>/       每個角色一個資料夾：character.json（角色）、user.json（牠認識的你）、
                                state.json（親密度等）、diary.json（日記）、conversations/YYYY-MM.jsonl（對話，一行一則）

■ logs/
  最近的紀錄檔（錯誤與事件，不含對話內容），出問題時可以交給開發者。
`;

async function readDirFiles(dir, filter) {
  let names;
  try {
    names = (await readdir(dir)).filter(filter).sort();
  } catch {
    return [];
  }
  return Promise.all(names.map(async (n) => ({ name: n, data: await readFile(path.join(dir, n)) })));
}

// 資料夾底下所有檔案（遞迴），回傳相對路徑
async function walk(dir, prefix = '') {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries.sort((x, y) => (x.name < y.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), rel)));
    else if (!e.name.includes('.tmp-')) out.push({ name: rel, data: await readFile(path.join(dir, e.name)) });
  }
  return out;
}

// 檔名不能有的字元換掉
const safeName = (s) => s.replace(/[\\/:*?"<>|\n\r]/g, '_').slice(0, 40) || 'PokkaTomo';

/**
 * 每個角色一個資料夾（對話紀錄.txt、日記.txt），加上原始資料與紀錄檔。
 * @returns {Promise<{ filename: string, buffer: Buffer }>}
 */
export async function buildExport(now = new Date()) {
  const stamp = localDateKey(now);
  const root = `pokkatomo-${stamp}`;
  const files = [{ name: `${root}/README.txt`, data: README }];
  const usedFolders = new Set();
  let totalMessages = 0;

  for (const ch of await listCharacters()) {
    await withCharacter(ch.id, async () => {
      const [profile, records, diaries] = await Promise.all([getProfile(), readArchive(), getDiaries()]);
      totalMessages += records.length;
      let folder = safeName(characterNameOf(ch));
      if (usedFolders.has(folder)) folder = `${folder}-${ch.id}`;
      usedFolders.add(folder);
      files.push(
        {
          name: `${root}/${folder}/對話紀錄.txt`,
          data: formatTranscript(records, {
            userName: profile.nickname || (profile.language === 'ja' ? 'わたし' : '我'),
            companionName: companionNameOf(profile)
          })
        },
        { name: `${root}/${folder}/日記.txt`, data: formatDiaries(diaries) }
      );
    });
  }

  // 原始資料：app/（共用）與 characters/<編號>/（每個角色），結構跟 server/data/ 一樣
  for (const f of await walk(APP_DIR)) files.push({ name: `${root}/data/app/${f.name}`, data: f.data });
  for (const f of await walk(CHARACTERS_DIR)) files.push({ name: `${root}/data/characters/${f.name}`, data: f.data });
  for (const f of await readDirFiles(LOG_DIR, (n) => n.endsWith('.log'))) {
    files.push({ name: `${root}/logs/${f.name}`, data: f.data });
  }

  const buffer = createZip(files);
  log.info('export_done', { files: files.length, bytes: buffer.length, messages: totalMessages });
  return { filename: `${root}.zip`, buffer };
}
