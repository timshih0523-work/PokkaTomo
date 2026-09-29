#!/usr/bin/env node
// scripts/migrate-v2.js — 把 server/data/ 從舊結構（v1）一次轉成新結構（v2）。只需要跑一次（2026-09 已經在使用者的 Mac 上跑過）。
//
//   node scripts/migrate-v2.js            轉換（先關掉 PokkaTomo）
//   node scripts/migrate-v2.js --dry-run  只顯示會怎麼轉、檢查結果，不動任何檔案
//
// 步驟：
//   1. 讀出所有舊檔案（backups/、logs/ 以外），在記憶體裡轉成新結構（server/lib/layoutV1.js）
//   2. 檢查：每個角色的對話則數、日記篇數、親密度點數跟舊的一樣；新的 JSON 都能解析
//   3. 舊檔案「整份搬到」backups/before-migrate-<日期時間>/（這就是完整備份，不刪任何東西）
//   4. 寫入新檔案；寫到一半失敗就把舊檔案搬回來
//   5. 順便整理 backups/：每日備份移到 backups/daily/，散落的檔案移到 backups/manual/
//   新結構已經存在（有 app/ 資料夾）就什麼都不做。

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';

import { DATA_DIR } from '../server/config.js';
import { convertV1, isV1Layout } from '../server/lib/layoutV1.js';

const dryRun = process.argv.includes('--dry-run');
const KEEP = new Set(['backups', 'logs']);

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, prefix = '') {
  const out = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (!prefix && KEEP.has(e.name)) continue;
    if (e.name === '.DS_Store' || e.name.includes('.tmp-') || e.name.includes('.corrupt')) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await walk(path.join(dir, e.name), rel));
    else out[rel] = await readFile(path.join(dir, e.name));
  }
  return out;
}

function countLines(buf) {
  let n = 0;
  for (const line of buf.toString('utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r.content === 'string') n += 1;
    } catch {
      /* 壞掉的行不算 */
    }
  }
  return n;
}

// 檢查：轉換後每個角色的對話、日記、點數要跟舊的一樣
function verify(oldFiles, conv) {
  const problems = [];
  const oldChars = JSON.parse(oldFiles['characters.json']?.toString('utf-8') || '[{"id":"default"}]');
  for (const r of conv.report) {
    const base = r.oldId === 'default' ? '' : `characters/${r.oldId}/`;
    const archive = Object.keys(oldFiles).filter((f) => f.startsWith(`${base}archive/`) && f.endsWith('.jsonl'));
    const oldMessages = archive.length
      ? archive.reduce((n, f) => n + countLines(oldFiles[f]), 0)
      : (JSON.parse(oldFiles[`${base}chat_history.json`]?.toString('utf-8') || '[]') || []).length;
    const oldDiaries = (JSON.parse(oldFiles[`${base}diary.json`]?.toString('utf-8') || '[]') || []).length;
    const oldPoints = JSON.parse(oldFiles[`${base}companion_state.json`]?.toString('utf-8') || '{}')?.points || 0;
    if (r.messages !== oldMessages) problems.push(`${r.name || r.oldId}：對話 ${oldMessages} → ${r.messages}`);
    if (r.diaries !== oldDiaries) problems.push(`${r.name || r.oldId}：日記 ${oldDiaries} → ${r.diaries}`);
    if (r.points !== oldPoints) problems.push(`${r.name || r.oldId}：親密度 ${oldPoints} → ${r.points}`);
  }
  if (conv.report.length !== oldChars.length) problems.push(`角色數 ${oldChars.length} → ${conv.report.length}`);
  for (const [rel, content] of Object.entries(conv.files)) {
    if (!rel.endsWith('.json')) continue;
    try {
      JSON.parse(content);
    } catch {
      problems.push(`${rel} 不是合法的 JSON`);
    }
  }
  return problems;
}

async function tidyBackups() {
  const dir = path.join(DATA_DIR, 'backups');
  if (!(await exists(dir))) return [];
  const moved = [];
  for (const name of await readdir(dir)) {
    const from = path.join(dir, name);
    let to = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(name)) to = path.join(dir, 'daily', name);
    else if (!(await stat(from)).isDirectory() && name !== '.DS_Store') to = path.join(dir, 'manual', name);
    if (!to || (await exists(to))) continue;
    await mkdir(path.dirname(to), { recursive: true });
    await rename(from, to);
    moved.push(`${name} → ${path.relative(dir, to)}`);
  }
  return moved;
}

async function main() {
  console.log(`資料夾：${DATA_DIR}`);
  if (await exists(path.join(DATA_DIR, 'app'))) {
    console.log('已經是新結構（有 app/ 資料夾），不用轉換。');
    return;
  }
  const oldFiles = await walk(DATA_DIR);
  if (!isV1Layout(oldFiles)) {
    console.log('沒有找到舊結構的資料，不用轉換。');
    return;
  }

  const conv = convertV1(oldFiles);
  console.log('\n角色對照：');
  for (const r of conv.report) {
    console.log(`  ${r.oldId.padEnd(15)} → ${r.newId}  ${r.name || '(沒取名)'}：對話 ${r.messages} 則、日記 ${r.diaries} 篇、親密度 ${r.points}`);
  }
  const problems = verify(oldFiles, conv);
  if (problems.length) {
    console.error('\n檢查沒過，沒有動任何檔案：');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\n檢查通過：對話、日記、親密度都跟轉換前一樣。');
  console.log(`新檔案 ${Object.keys(conv.files).length} 個：`);
  for (const rel of Object.keys(conv.files).sort()) console.log(`  ${rel}`);

  if (dryRun) {
    console.log('\n（--dry-run：沒有動任何檔案）');
    return;
  }

  // 3. 舊檔案整份搬進備份資料夾
  const backup = path.join(DATA_DIR, 'backups', `before-migrate-${stamp}`);
  await mkdir(backup, { recursive: true });
  const movedOld = [];
  for (const name of await readdir(DATA_DIR)) {
    if (KEEP.has(name)) continue;
    await rename(path.join(DATA_DIR, name), path.join(backup, name));
    movedOld.push(name);
  }
  console.log(`\n舊檔案已經搬到 ${path.relative(DATA_DIR, backup)}/`);

  // 4. 寫入新檔案；失敗就還原
  try {
    for (const [rel, content] of Object.entries(conv.files)) {
      const dest = path.join(DATA_DIR, rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, content, 'utf-8');
    }
  } catch (err) {
    console.error(`寫入新檔案失敗：${err.message}，還原舊檔案…`);
    await rm(path.join(DATA_DIR, 'app'), { recursive: true, force: true });
    await rm(path.join(DATA_DIR, 'characters'), { recursive: true, force: true });
    for (const name of movedOld) await rename(path.join(backup, name), path.join(DATA_DIR, name));
    process.exit(1);
  }
  console.log('新結構寫入完成。');

  const tidied = await tidyBackups();
  if (tidied.length) {
    console.log('整理 backups/：');
    for (const t of tidied) console.log(`  ${t}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
