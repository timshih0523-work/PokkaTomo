// diaryService.js
// PokkaTomo 的日記：每天用「自己的口吻」把當天跟使用者聊過的事寫成一篇短日記。
//
// 這是 SHARP ポケとも（這個專案的靈感來源）最核心的賣點之一——「會寫日記的 AI 桌寵」。
// 在這個專案裡它同時是記憶架構的一層：
//   短期記憶：最近幾輪對話，直接折進每次的 prompt（fmService.fmRespond）
//   中期記憶：這裡的日記，最近幾天的摘要會放進 system prompt（getRecentMemories）
//   長期記憶：user.json 的喜好、紀念日（historyService.extractFacts）
// 以前只有短期 + 長期，聊天紀錄一超過上限、或隔了幾天，「前幾天聊過什麼」就完全不見了。
//
// 產生時機：
//   - 過去的日子：伺服器啟動時、每輪對話後，在背景把「有聊天但還沒有日記」的日子補寫
//     （最多補最近 DIARY_BACKFILL_DAYS 天，一次一篇，排在背景 fm 佇列裡，不拖慢聊天）。
//   - 今天：使用者在日記面板按「請 PokkaTomo 寫今天的日記」才寫，可以重寫。

import { onCacheReset } from './lib/cacheRegistry.js';
import { fmRespond, runBackgroundFm } from './fmService.js';
import { getProfile } from './profileService.js';
import { getAllHistory } from './historyService.js';
import { enqueue } from './lib/asyncQueue.js';
import { readJson, writeJsonAtomic } from './lib/jsonStore.js';
import { parseMoodTag, MOOD_INSTRUCTION } from './lib/mood.js';
import { localDateKey, toLocalIso } from './lib/time.js';
import { charPaths, currentCharacterId } from './lib/characterContext.js';
import { DIARY_BACKFILL_DAYS, DIARY_MEMORY_DAYS, DIARY_MAX_ENTRIES } from './config.js';
import { log } from './lib/logger.js';

// 每個角色有自己的日記，位置見 lib/characterContext.js
const diaryPath = () => charPaths().diary;

// fm（Apple Foundation Models）的上下文長度有限，一天聊很多的話不能整天原文全塞進去：
// 只取當天最後 N 則、每則截斷，總長再設上限。
const TRANSCRIPT_MAX_MESSAGES = 60;
const TRANSCRIPT_MSG_MAX_LEN = 120;
const TRANSCRIPT_MAX_LEN = 3000;

async function readDiary() {
  const parsed = await readJson(diaryPath(), () => []);
  return Array.isArray(parsed) ? parsed : [];
}

/** 全部日記，新的在前。 */
export async function getDiaries() {
  const all = await readDiary();
  return [...all].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * 給 buildSystemPrompt 用的中期記憶：今天以前最近幾篇日記。
 * （今天的還在進行中，當天內容本來就在短期上下文裡，不用重複放。）
 */
export async function getRecentMemories(now = new Date()) {
  const today = localDateKey(now);
  const all = await getDiaries();
  return all
    .filter((d) => d.date < today)
    .slice(0, DIARY_MEMORY_DAYS)
    .map((d) => ({ date: d.date, text: d.text }));
}

function buildDiaryInstructions(profile, date) {
  const lang =
    profile?.language === 'ja'
      ? '日記一律用日文（自然口語的日本語）寫，提到自己時用「わたし」。'
      : '日記一律用繁體中文寫，提到自己時用「我」。';
  const who = profile?.nickname ? `使用者叫「${profile.nickname}」。` : '';
  // 刻意不告訴模型角色的名字、也要求日記裡不要出現自己的名字：角色名字可以在設定裡改，
  // 如果日記寫「PokkaTomo 今天很開心」，改名之後回頭翻舊日記會很奇怪。
  return [
    '你是陪在使用者身邊的小夥伴。現在是寫日記的時間，不是在聊天。',
    `請用你自己的第一人稱口吻，寫一篇 ${date} 的短日記：今天跟使用者聊了什麼、對方看起來心情怎樣、你自己的感受。`,
    '日記裡絕對不要寫出你自己的名字，也不要用第三人稱稱呼自己，一律用第一人稱。',
    who,
    '只能根據下面提供的對話內容寫，不要編造對話裡沒有的事情。寫成一段 80 到 200 字的文字，不要條列、不要標題。',
    lang,
    MOOD_INSTRUCTION.replace('你說這句話時的心情', '你寫這篇日記時的心情')
  ]
    .filter(Boolean)
    .join('\n');
}

function buildTranscript(messages) {
  let text = messages
    .slice(-TRANSCRIPT_MAX_MESSAGES)
    .map((m) => `${m.role === 'user' ? '使用者' : '我'}：${String(m.content).slice(0, TRANSCRIPT_MSG_MAX_LEN)}`)
    .join('\n');
  if (text.length > TRANSCRIPT_MAX_LEN) text = text.slice(-TRANSCRIPT_MAX_LEN);
  return text;
}

// 日記有變動就 +1（每個角色各自算），ragService 看到版本變了會重建日記那部分的索引。
const diaryVersions = new Map();
onCacheReset((id) => (id ? diaryVersions.delete(id) : diaryVersions.clear()));
export const getDiaryVersion = () => diaryVersions.get(currentCharacterId()) || 0;

async function saveEntry(entry) {
  const file = diaryPath();
  const id = currentCharacterId();
  return enqueue(file, async () => {
    const all = await readDiary();
    const next = all.filter((d) => d.date !== entry.date);
    next.push(entry);
    next.sort((a, b) => (a.date < b.date ? -1 : 1));
    await writeJsonAtomic(file, next.slice(-DIARY_MAX_ENTRIES));
    diaryVersions.set(id, (diaryVersions.get(id) || 0) + 1);
    return entry;
  });
}

/**
 * 替某一天寫日記。那天沒有任何對話的話回傳 null（沒東西可寫，不硬寫）。
 * @param {string} date 'YYYY-MM-DD'（本地日期）
 */
export async function writeDiaryFor(date) {
  const history = await getAllHistory();
  const dayMessages = history.filter((h) => h?.ts && localDateKey(new Date(h.ts)) === date);
  if (!dayMessages.some((m) => m.role === 'user')) return null;

  const profile = await getProfile();
  const raw = await fmRespond({
    purpose: 'diary',
    message: `以下是 ${date} 的對話（「我」是你自己說的話）：\n${buildTranscript(dayMessages)}`,
    instructions: buildDiaryInstructions(profile, date),
    history: []
  });
  const { text, mood } = parseMoodTag(raw);
  if (!text) return null;
  return saveEntry({ date, text, mood, createdAt: toLocalIso(Date.now()) });
}

/** 使用者按按鈕要求寫（或重寫）今天的日記。排在背景 fm 佇列，跟記憶提取不會同時跑。 */
export function writeTodayDiary(now = new Date()) {
  return runBackgroundFm(() => writeDiaryFor(localDateKey(now)));
}

const backfillInFlight = new Map(); // 角色 id → 進行中的補寫

/**
 * 把「有聊天、但還沒寫日記」的過去日子補寫起來。重複呼叫時共用同一個進行中的工作，
 * 不會同時補兩次；失敗（fm 不可用等）就等下一次觸發再試，不影響其他功能。
 */
export function backfillPastDiaries(now = new Date()) {
  const id = currentCharacterId();
  if (backfillInFlight.has(id)) return backfillInFlight.get(id);
  const job = (async () => {
    const today = localDateKey(now);
    const [history, diaries] = await Promise.all([getAllHistory(), readDiary()]);
    const written = new Set(diaries.map((d) => d.date));
    const pending = [
      ...new Set(
        history
          .filter((h) => h?.ts && h.role === 'user')
          .map((h) => localDateKey(new Date(h.ts)))
          .filter((d) => d < today && !written.has(d))
      )
    ]
      .sort()
      .slice(-DIARY_BACKFILL_DAYS);

    for (const date of pending) {
      try {
        await runBackgroundFm(() => writeDiaryFor(date));
      } catch (err) {
        log.warn('diary_failed', { date, error: err.message });
        break; // fm 掛了的話後面幾天大概也會失敗，先停下來
      }
    }
  })().finally(() => {
    backfillInFlight.delete(id);
  });
  backfillInFlight.set(id, job);
  return job;
}
