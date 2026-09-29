// ragService.js
// 輕量 RAG（Retrieval-Augmented Generation）：聊天時，從「很久以前」的對話和日記裡，
// 找出跟這句話有關的幾件事，放進 prompt，讓角色可以說「你之前說過喜歡豚骨拉麵對吧？」。
//
// 記憶分層（見 README_TECH 4.6）：
//   短期：最近 8 則對話（直接折進訊息）
//   中期：最近 3 篇日記
//   長期：喜好／紀念日（profile）＋ 這裡的「依相關性想起來的舊事」
//
// 做法：BM25 關鍵字檢索（lib/textIndex.js），不用向量模型——零下載、零套件、在 Mac 上幾毫秒。
// 索引放在記憶體：第一次用到時從封存（archive/*.jsonl）與日記建好，之後每則新訊息增量加入，
// 日記有改就重建日記那部分。一年的聊天量（幾萬則）建索引也只要一兩秒。
//
// 一份文件（doc）＝ 一輪對話（使用者說的話＋角色的回覆），或一篇日記。

import { readArchive, onArchiveAppend } from './archiveService.js';
import { getDiaries, getDiaryVersion } from './diaryService.js';
import { Bm25Index } from './lib/textIndex.js';
import { localDateKey } from './lib/time.js';
import { currentCharacterId } from './lib/characterContext.js';
import { log } from './lib/logger.js';
import { onCacheReset } from './lib/cacheRegistry.js';
import { RAG_TOP_K, RAG_ENTRY_MAX, RAG_MIN_SCORE, RAG_RELATIVE_MIN } from './config.js';

// 每個角色一份索引（角色之間的回憶不互通）。角色 id → { index, building, diaryVersion, pendingUser, buffered }
const states = new Map();
onCacheReset((id) => (id ? states.delete(id) : states.clear()));
function stateOf(id = currentCharacterId()) {
  if (!states.has(id)) states.set(id, { index: null, building: null, diaryVersion: -1, pendingUser: null, buffered: null });
  return states.get(id);
}

// 新訊息進封存 → 加進那個角色的索引（還在建索引的話先暫存，建完再補）
onArchiveAppend((records, id) => {
  const st = stateOf(id);
  if (st.index) addRecords(st, st.index, records);
  else if (st.buffered) st.buffered.push(...records);
});

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function chatDoc(user, reply) {
  return {
    id: `c:${user.id || user.ts}`,
    source: 'chat',
    ts: user.ts,
    date: localDateKey(new Date(user.ts)),
    user: user.content,
    reply: reply?.content || ''
  };
}

// 使用者說的話權重比較高（重複一次）：「她說過什麼」比「我回了什麼」重要。
const chatText = (d) => `${d.user}\n${d.user}\n${d.reply}`;

function addRecords(st, ix, records) {
  for (const r of records) {
    if (r.kind === 'fortune' || r.proactive) continue; // 占卜、主動問候不是她說的事
    if (r.role === 'user') {
      if (st.pendingUser) ix.add(chatDoc(st.pendingUser, null), chatText(chatDoc(st.pendingUser, null)));
      st.pendingUser = r;
    } else if (st.pendingUser) {
      const d = chatDoc(st.pendingUser, r);
      ix.add(d, chatText(d));
      st.pendingUser = null;
    }
  }
}

async function syncDiaries(st, ix) {
  const version = getDiaryVersion();
  if (version === st.diaryVersion && ix.diaryIds) return;
  for (const id of ix.diaryIds || []) ix.remove(id);
  ix.diaryIds = [];
  for (const d of await getDiaries()) {
    const doc = { id: `d:${d.date}`, source: 'diary', ts: new Date(`${d.date}T21:00:00`).getTime(), date: d.date, text: d.text };
    if (ix.add(doc, d.text)) ix.diaryIds.push(doc.id);
  }
  st.diaryVersion = version;
}

async function build(st) {
  const started = Date.now();
  const ix = new Bm25Index();
  st.pendingUser = null;
  // 先開始暫存再讀檔：讀檔期間進來的新訊息先存起來，讀完再補上，才不會漏掉。
  st.buffered = [];
  const records = await readArchive();
  const seen = new Set(records.map((r) => r.id));
  addRecords(st, ix, records);
  addRecords(st, ix, st.buffered.filter((r) => !seen.has(r.id)));
  st.buffered = null;
  await syncDiaries(st, ix);
  st.index = ix;
  log.info('rag_index_built', { docs: ix.size, ms: Date.now() - started });
  return ix;
}

async function getIndex() {
  const st = stateOf();
  if (st.index) {
    await syncDiaries(st, st.index);
    return st.index;
  }
  if (!st.building) st.building = build(st).finally(() => (st.building = null));
  return st.building;
}

/**
 * 找出跟 query 有關的舊事。
 * @param {string} query 使用者這一句話
 * @param {{ excludeIds?: string[], excludeDates?: string[], limit?: number }} [opts]
 *   excludeIds：已經在短期上下文裡的對話（紀錄的 id），不用再想起來
 *     （以前用「這個時間之後」判斷；對話時間存檔只到秒，同一秒的舊話會被誤排除，所以改用 id）
 *   excludeDates：已經放進 prompt 的日記日期（中期記憶）
 * @returns {Promise<Array<{ date: string, text: string, source: 'chat'|'diary', score: number }>>}
 */
export async function recall(query, { excludeIds = [], excludeDates = [], limit = RAG_TOP_K } = {}) {
  const started = Date.now();
  const ix = await getIndex();
  const skipDates = new Set(excludeDates);
  const skipIds = new Set(excludeIds.map((id) => `c:${id}`));
  const hits = ix.search(query, {
    limit,
    minScore: RAG_MIN_SCORE,
    filter: (d) => (d.source === 'diary' ? !skipDates.has(d.date) : !skipIds.has(d.id))
  });
  const top = hits[0]?.score || 0;
  const result = hits
    .filter((h) => h.score >= top * RAG_RELATIVE_MIN)
    .map(({ doc, score }) => ({
      date: doc.date,
      source: doc.source,
      score: Math.round(score * 100) / 100,
      text:
        doc.source === 'diary'
          ? `（你的日記）${clip(doc.text, RAG_ENTRY_MAX)}`
          : `使用者說「${clip(doc.user, 70)}」${doc.reply ? `，你回「${clip(doc.reply, 40)}」` : ''}`
    }));
  log.info('rag_recall', { hits: result.length, docs: ix.size, ms: Date.now() - started });
  return result;
}

/** 給測試用：丟掉索引，下次重建。 */
export function _resetRagIndex() {
  states.clear();
}
