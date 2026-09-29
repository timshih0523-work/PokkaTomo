// archiveService.js
// 對話資料庫：每個角色的 conversations/YYYY-MM.jsonl，一行一則訊息，只追加、不修改、不刪除。
// 這是對話「唯一」的一份：聊天時的上下文（最近幾十則）、日記、RAG、匯出、日記面板的「對話」頁籤都從這裡讀。
//
// 為什麼用 JSONL 不用 SQLite：Node 內建的 sqlite 要 22.5 以上而且還是實驗功能，
// 原生套件（better-sqlite3）要編譯，在使用者的 Mac 上出問題的機率比較高。
// JSONL 零安裝、人看得懂、壞掉一行只影響那一行、追加寫入不用重寫整個檔。
// 一年大概幾 MB，讀最近的對話只要讀最新的一兩個月份檔。
//
// 檔案裡的一行（欄位順序固定，時間是本地時間＋時區，人看得懂）：
//   {"id":"…","time":"2026-09-29T10:22:20+08:00","role":"user","content":"…","mood":"joy"}
//   選用欄位：mood、kind（'fortune' 占卜）、proactive（主動問候的時段）、fortune（占卜的結果，不含說明文字——說明就在 content 裡）
// 程式裡拿到的是 { id, ts（毫秒）, role, content, … }，占卜的 fortune.text 讀出來時從 content 補回去。

import { appendFile, mkdir, readdir, readFile } from 'fs/promises';
import path from 'path';

import { charPaths, currentCharacterId } from './lib/characterContext.js';
import { enqueue } from './lib/asyncQueue.js';
import { log } from './lib/logger.js';
import { assertDataHome } from './lib/dataHome.js';
import { localDateKey, toLocalIso, parseTime } from './lib/time.js';

// 排隊的 key 用資料夾路徑：不同角色的對話各自排隊
const dirOf = () => charPaths().conversationsDir;
const queueKey = () => dirOf();
const listeners = new Set();
let seq = 0;

function monthFile(ts) {
  return path.join(dirOf(), `${localDateKey(new Date(ts)).slice(0, 7)}.jsonl`);
}

function toRecord(m) {
  const ts = Number.isFinite(m.ts) ? m.ts : Date.now();
  // 存檔精確到秒，程式裡也用同樣的值，這樣「剛寫進去的」跟「之後讀出來的」一模一樣
  const sec = Math.floor(ts / 1000) * 1000;
  const rec = {
    id: m.id || `${ts.toString(36)}-${(seq++).toString(36)}-${m.role === 'user' ? 'u' : 'a'}`,
    ts: sec,
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content ?? '')
  };
  if (m.mood) rec.mood = m.mood;
  if (m.kind) rec.kind = m.kind;
  if (m.proactive) rec.proactive = m.proactive;
  if (m.fortune && typeof m.fortune === 'object') rec.fortune = m.fortune; // 占卜卡片的內容（畫面要重畫卡片）
  return rec;
}

// 程式裡的紀錄 → 檔案裡的一行
export function recordToLine(r) {
  const out = { id: r.id, time: toLocalIso(r.ts), role: r.role, content: r.content };
  if (r.mood) out.mood = r.mood;
  if (r.kind) out.kind = r.kind;
  if (r.proactive) out.proactive = r.proactive;
  if (r.fortune) {
    // 占卜的說明文字已經在 content 裡（「【今日占卜】…」下一行開始），不再存第二份
    const { text: _t, createdAt: _c, mood: _m, ...meta } = r.fortune;
    out.fortune = meta;
  }
  return JSON.stringify(out);
}

// 檔案裡的一行 → 程式裡的紀錄（也接受舊格式的 ts 數字）
export function lineToRecord(line) {
  const o = JSON.parse(line);
  if (!o || typeof o.content !== 'string') return null;
  const ts = parseTime(o.time ?? o.ts);
  if (ts === null) return null;
  const r = { id: o.id, ts, role: o.role === 'user' ? 'user' : 'assistant', content: o.content };
  if (o.mood) r.mood = o.mood;
  if (o.kind) r.kind = o.kind;
  if (o.proactive) r.proactive = o.proactive;
  if (o.fortune && typeof o.fortune === 'object') {
    const nl = o.content.indexOf('\n');
    r.fortune = { ...o.fortune, text: o.fortune.text ?? (nl === -1 ? '' : o.content.slice(nl + 1)), mood: o.mood };
  }
  return r;
}

/** 有新訊息進封存時通知 fn(records, 角色 id)（ragService 用來增量更新索引）。回傳取消訂閱的函式。 */
export function onArchiveAppend(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 追加訊息到封存檔。依訊息時間分到各月份的檔案。
 * @param {Array<object>} messages { role, content, ts?, mood?, kind?, proactive?, fortune? }
 * @returns {Promise<object[]>} 實際寫入的紀錄
 */
export function appendToArchive(messages) {
  const records = (messages || []).filter((m) => m && m.content).map(toRecord);
  if (!records.length) return Promise.resolve([]);
  const characterId = currentCharacterId();
  return enqueue(queueKey(), async () => {
    assertDataHome();
    await mkdir(dirOf(), { recursive: true });
    const byFile = new Map();
    for (const r of records) {
      const f = monthFile(r.ts);
      byFile.set(f, (byFile.get(f) || '') + `${recordToLine(r)}\n`);
    }
    for (const [f, text] of byFile) await appendFile(f, text, 'utf-8');
    for (const fn of listeners) {
      try {
        fn(records, characterId);
      } catch (err) {
        log.warn('archive_listener_failed', { error: err.message });
      }
    }
    return records;
  });
}

/** 所有對話檔的檔名（YYYY-MM.jsonl），舊到新。 */
export async function listArchiveFiles() {
  try {
    return (await readdir(dirOf())).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// 讀一個月份檔（不存在 → []）。壞掉的行（例如寫到一半斷電）跳過，不影響其他行。
async function readMonthFile(name) {
  let text;
  try {
    text = await readFile(path.join(dirOf(), name), 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return { records: [], bad: 0 };
    throw err;
  }
  const records = [];
  let bad = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = lineToRecord(line);
      if (r) records.push(r);
      else bad += 1;
    } catch {
      bad += 1;
    }
  }
  return { records, bad };
}

// 時間一樣的（同一秒的「使用者→角色」）保持檔案裡的順序（Array.sort 是穩定排序）
const byTime = (a, b) => a.ts - b.ts;

/** 全部對話（舊到新）。 */
export async function readArchive() {
  const out = [];
  let bad = 0;
  for (const f of await listArchiveFiles()) {
    const r = await readMonthFile(f);
    out.push(...r.records);
    bad += r.bad;
  }
  if (bad) log.warn('archive_bad_lines', { count: bad });
  return out.sort(byTime);
}

/** 最近的 limit 則對話（舊到新）。從最新的月份往回讀，夠了就停。 */
export async function readRecent(limit) {
  const files = await listArchiveFiles();
  const chunks = [];
  let count = 0;
  for (let i = files.length - 1; i >= 0 && count < limit; i--) {
    const { records } = await readMonthFile(files[i]);
    chunks.unshift(records.sort(byTime));
    count += records.length;
  }
  return chunks.flat().slice(-limit);
}

/**
 * 某一天（本地日期 YYYY-MM-DD）的全部訊息，舊到新。只讀那個月份的檔案。
 * 「今天的對話」按鈕用（routes/history.js 的 GET /api/history/day）。
 */
export async function readArchiveDay(dateKey) {
  const { records } = await readMonthFile(`${dateKey.slice(0, 7)}.jsonl`);
  return records.filter((r) => localDateKey(new Date(r.ts)) === dateKey).sort(byTime);
}
