// companionService.js
// 角色自己的「生活狀態」，存在每個角色資料夾的 state.json：
//   - 成長／親密度：聊天、摸摸頭會累積親密度點數，升級後說話變得更親近、解鎖新的反應
//     （參考 Moflin「個性由你的對待方式慢慢長出來」、NICOBO「慢慢學會說話」、ポケとも「越聊越懂你」）
//   - 睡覺：使用者說晚安之後角色真的去睡（前端顯示睡著、說夢話），隔天早上才醒，或被叫醒
//   - 出門：使用者說出門了，記下時間，回來時可以說「歡迎回來，出去了 N 小時耶」
//   - 今日占卜：一天只抽一次（見 fortuneService.js），存在這裡
//
// 規則刻意設計成「只加不扣」：不會因為幾天沒來就掉等級，陪伴型產品不該讓人有壓力。
// 每天的點數有上限，避免一直狂點角色刷等級（那樣升級就沒意義了）。

import { enqueue } from './lib/asyncQueue.js';
import { readJson, writeJsonAtomic } from './lib/jsonStore.js';
import { localDateKey, toLocalIso, parseTime } from './lib/time.js';
import { charPaths } from './lib/characterContext.js';
import {
  GROWTH_LEVELS,
  GROWTH_CHAT_POINT_DAILY_CAP,
  GROWTH_PAT_POINT_DAILY_CAP,
  GROWTH_FIRST_VISIT_BONUS,
  GROWTH_STREAK_BONUS,
  AWAY_MAX_HOURS
} from './config.js';

// 每個角色有自己的狀態（親密度、睡覺、出門、占卜），位置見 lib/characterContext.js
const statePath = () => charPaths().state;

function defaultState() {
  return {
    points: 0,
    daily: { date: null, chatPoints: 0, patPoints: 0 },
    streak: { lastDay: null, days: 0 },
    // touches：各部位被摸的次數（部位名稱跟前端 web/src/avatarParts.js 一樣）
    totals: { messages: 0, pats: 0, touches: {} },
    sleepingSince: null,
    leftAt: null,
    fortune: null
  };
}

// 檔案裡的時間是人看得懂的字串（2026-09-29T22:10:00+08:00），程式裡用毫秒數字
async function readState() {
  const raw = await readJson(statePath(), defaultState);
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    daily: { ...base.daily, ...(raw.daily || {}) },
    streak: { ...base.streak, ...(raw.streak || {}) },
    totals: { ...base.totals, ...(raw.totals || {}), touches: { ...(raw.totals?.touches || {}) } },
    sleepingSince: parseTime(raw.sleepingSince),
    leftAt: parseTime(raw.leftAt),
    fortune: raw.fortune && typeof raw.fortune === 'object' ? { ...raw.fortune, createdAt: parseTime(raw.fortune.createdAt) } : null
  };
}

function toFile(state) {
  return {
    points: state.points,
    daily: state.daily,
    streak: state.streak,
    totals: state.totals,
    sleepingSince: toLocalIso(state.sleepingSince),
    leftAt: toLocalIso(state.leftAt),
    fortune: state.fortune ? { ...state.fortune, createdAt: toLocalIso(state.fortune.createdAt) } : null
  };
}

/** 讀 → 改 → 寫，整段排隊（跟其他 JSON 檔一樣避免遺失更新）。 */
function updateState(mutator) {
  const file = statePath();
  return enqueue(file, async () => {
    const state = await readState();
    const result = await mutator(state);
    await writeJsonAtomic(file, toFile(state));
    return { state, result };
  });
}

export function getState() {
  return readState();
}

// ---------- 成長 ----------

/** 點數 → 等級資訊。等級的名字跟說話風格：名字在前端 i18n，說話風格在 relationshipPromptLine。 */
export function levelInfo(points) {
  let idx = 0;
  for (let i = 0; i < GROWTH_LEVELS.length; i++) if (points >= GROWTH_LEVELS[i]) idx = i;
  const currentMin = GROWTH_LEVELS[idx];
  const nextMin = GROWTH_LEVELS[idx + 1] ?? null;
  return {
    level: idx + 1,
    points,
    currentMin,
    nextMin,
    progress: nextMin == null ? 1 : (points - currentMin) / (nextMin - currentMin)
  };
}

function rollDaily(state, today) {
  if (state.daily.date !== today) state.daily = { date: today, chatPoints: 0, patPoints: 0 };
}

// 今天第一次來：+基本分；昨天也有來（連續天數）再加一點。回傳這次加了幾分。
function visitBonus(state, today) {
  if (state.streak.lastDay === today) return 0;
  const yesterday = localDateKey(new Date(new Date(`${today}T12:00:00`).getTime() - 86400000));
  state.streak.days = state.streak.lastDay === yesterday ? state.streak.days + 1 : 1;
  state.streak.lastDay = today;
  return GROWTH_FIRST_VISIT_BONUS + (state.streak.days > 1 ? GROWTH_STREAK_BONUS : 0);
}

function addPoints(state, delta) {
  const before = levelInfo(state.points).level;
  state.points += delta;
  const after = levelInfo(state.points);
  return { growth: after, levelUp: after.level > before };
}

// ---------- 睡覺 ----------

// 說晚安之後，睡到「下一個早上 6 點」，而且至少睡 4 小時（凌晨 3 點說晚安就睡到 7 點）。
function wakeTime(sleepingSince) {
  const s = new Date(sleepingSince);
  const six = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 6, 0, 0);
  if (six <= s) six.setDate(six.getDate() + 1);
  return Math.max(six.getTime(), sleepingSince + 4 * 3600 * 1000);
}

export function isAsleep(state, now = Date.now()) {
  return !!state.sleepingSince && now < wakeTime(state.sleepingSince);
}

/** 出門到現在幾小時（超過 AWAY_MAX_HOURS 就當作忘記說回來，不算）；沒出門回傳 null。 */
export function awayHours(state, now = Date.now()) {
  if (!state.leftAt) return null;
  const h = (now - state.leftAt) / 3600000;
  if (h > AWAY_MAX_HOURS) return null;
  return Math.max(0, Math.round(h * 10) / 10);
}

// ---------- 事件 ----------

/**
 * 一輪對話成功之後呼叫：加親密度、處理晚安／出門／回家。
 * @param {{ ritual: string|null, now?: number }} p
 */
export async function recordChat({ ritual, now = Date.now() }) {
  const { result } = await updateState((state) => {
    const today = localDateKey(new Date(now));
    rollDaily(state, today);
    let delta = visitBonus(state, today);
    if (state.daily.chatPoints < GROWTH_CHAT_POINT_DAILY_CAP) {
      state.daily.chatPoints += 1;
      delta += 1;
    }
    state.totals.messages += 1;

    // 講話就會把牠叫醒；說晚安才會睡。
    state.sleepingSince = ritual === 'goodnight' ? now : null;
    if (ritual === 'leaving') state.leftAt = now;
    if (ritual === 'home') state.leftAt = null;

    return addPoints(state, delta);
  });
  return result;
}

// 前端可能回報的部位（跟 web/src/avatarParts.js 的 PARTS 一致）。不認得的當成 body。
export const TOUCH_PARTS = ['head', 'face', 'cheek', 'ear', 'belly', 'body', 'hand', 'foot', 'tail', 'back'];

/**
 * 摸角色（點角色身上某個部位）。每天有上限，超過還是會有反應，只是不加分。
 * @param {number} [now]
 * @param {string} [part] 摸到哪裡
 */
export async function recordPat(now = Date.now(), part = 'body') {
  const p = TOUCH_PARTS.includes(part) ? part : 'body';
  const { result } = await updateState((state) => {
    const today = localDateKey(new Date(now));
    rollDaily(state, today);
    state.totals.pats += 1;
    state.totals.touches[p] = (state.totals.touches[p] || 0) + 1;
    let delta = 0;
    if (state.daily.patPoints < GROWTH_PAT_POINT_DAILY_CAP) {
      state.daily.patPoints += 1;
      delta = 1;
    }
    return addPoints(state, delta);
  });
  return result;
}

/** 主動問候時用：拿到「出門多久了」之後就清掉，不要每次打招呼都說歡迎回來。 */
export async function consumeAway(now = Date.now()) {
  const { result } = await updateState((state) => {
    const h = awayHours(state, now);
    state.leftAt = null;
    return h;
  });
  return result;
}

/** 叫醒（前端在睡覺時被連點好幾下）。 */
export async function wakeUp() {
  await updateState((state) => {
    state.sleepingSince = null;
  });
}

export async function saveFortune(fortune) {
  await updateState((state) => {
    state.fortune = fortune;
  });
}

// ---------- 給 prompt 用 ----------

const FAVORITE_TOUCH_LINES = {
  head: '對方最常摸你的頭，你很喜歡被摸頭。',
  cheek: '對方很喜歡戳你的臉頰，你假裝抗議其實有點開心。',
  ear: '對方很常摸你的耳朵，你的耳朵很怕癢。',
  belly: '對方很常戳你的肚子，你一被戳就會笑。',
  face: '對方很常盯著你的臉看。'
};

/** 最常被摸的部位：至少 20 次，而且比第二名多一半以上；不明顯就回傳 null。 */
export function favoriteTouch(touches = {}) {
  const sorted = Object.entries(touches).sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] < 20) return null;
  if (sorted[1] && sorted[0][1] < sorted[1][1] * 1.5) return null;
  return sorted[0][0];
}

const TONE_BY_LEVEL = [
  // 等級只影響「有多親密」，不影響「活不活潑」：以前 Lv1 寫「害羞、客氣」，回覆變得很生硬。
  '你們才剛認識不久，但你本來就很親切活潑，像剛交到的好朋友一樣自然地聊，會好奇地問對方的事。',
  '你們慢慢熟起來了，說話更隨性，會開點小玩笑。',
  '你們已經是好朋友了，說話很隨性，會開玩笑，偶爾撒嬌一下。',
  '你們無話不談，你會主動分享自己的心情，也更常記得、關心對方生活裡的小事。',
  '你們是心靈之友，你非常信任對方，說話很親暱、放鬆，常常有默契地接話。',
  '對你來說對方就像家人一樣重要，你們之間有很多只有彼此懂的默契。'
];

/**
 * @param {object} state
 * @param {string|null} firstMetAt 'YYYY-MM-DD'
 */
export function relationshipPromptLine(state, firstMetAt, now = new Date()) {
  const { level } = levelInfo(state.points);
  const parts = [TONE_BY_LEVEL[Math.min(level, TONE_BY_LEVEL.length) - 1]];
  if (firstMetAt) {
    const [y, m, d] = firstMetAt.split('-').map(Number);
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) / 86400000) + 1;
    if (days > 0) parts.push(`今天是你們認識的第 ${days} 天。`);
  }
  // 很常被摸 → 變得愛撒嬌（像 Moflin 一樣，個性會被對待的方式慢慢影響）
  if (state.totals.pats >= 50 && state.totals.pats >= state.totals.messages * 0.3) {
    parts.push('對方很常摸你，所以你變得有點愛撒嬌、黏人。');
  }
  // 最常被摸的部位（至少 20 次、而且明顯最多）→ 變成你們之間的小習慣，偶爾可以提起
  const fav = favoriteTouch(state.totals.touches);
  if (fav && FAVORITE_TOUCH_LINES[fav]) parts.push(FAVORITE_TOUCH_LINES[fav]);
  return parts.join('');
}
