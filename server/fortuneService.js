// fortuneService.js
// 今日占卜（今日の占い）。Romi、Gatebox 都有，在日本非常受歡迎。
//
// 設計：
//   - 一天只抽一次：結果存在角色的 state.json，當天再按只是「再看一次」，不能重抽到大吉為止。
//   - 抽籤本身（運勢、幸運色、幸運物、幸運數字）用「日期」當亂數種子決定，不靠模型——
//     模型只負責用角色的口吻寫兩三句說明，可以把喜好、天氣自然地連在一起。
//     模型不可用時，用固定的句型頂替，占卜功能照樣能用。
//   - 運勢刻意都是好的（大吉～末吉，沒有「凶」）：這是陪伴用的小遊戲，不需要讓人一早心情不好。
//   - 占卜結果也會寫進聊天紀錄，之後聊天時角色知道「今天幫她占卜過、結果是什麼」。

import { fmRespond, getFmStatus, buildSystemPrompt } from './fmService.js';
import { getProfile } from './profileService.js';
import { appendMessages } from './historyService.js';
import { getState, saveFortune, relationshipPromptLine } from './companionService.js';
import { getWeatherForPrompt } from './weatherService.js';
import { parseMoodTag } from './lib/mood.js';
import { localDateKey } from './lib/time.js';
import { log } from './lib/logger.js';
import { currentCharacterId } from './lib/characterContext.js';

const RANKS = [
  // [id, 權重]
  ['daikichi', 15],
  ['chukichi', 25],
  ['shokichi', 25],
  ['kichi', 25],
  ['suekichi', 10]
];

// 運勢名稱中日文都用同一組漢字（日本的おみくじ用語），台灣人也看得懂。
const RANK_TEXT = { daikichi: '大吉', chukichi: '中吉', shokichi: '小吉', kichi: '吉', suekichi: '末吉' };

const COLORS = {
  zh: ['櫻花粉', '天空藍', '薄荷綠', '檸檬黃', '薰衣草紫', '珊瑚橘', '奶油白', '海軍藍', '蜜桃色', '抹茶綠'],
  ja: ['さくらピンク', 'そらいろ', 'ミントグリーン', 'レモンイエロー', 'ラベンダー', 'コーラルオレンジ', 'クリームホワイト', 'ネイビー', 'ピーチ', '抹茶グリーン']
};
const ITEMS = {
  zh: ['熱可可', '手帕', '髮夾', '小盆栽', '耳機', '便利貼', '草莓', '雨傘', '香氛蠟燭', '明信片', '貼紙', '保溫杯'],
  ja: ['ホットココア', 'ハンカチ', 'ヘアピン', '小さな観葉植物', 'イヤホン', '付箋', 'いちご', '傘', 'アロマキャンドル', 'ポストカード', 'シール', 'マグボトル']
};
const FALLBACK_TEXT = {
  zh: (r, c, i) => `今天是${r}喔！帶著${c}的東西出門，再加上${i}，會有好事發生～`,
  ja: (r, c, i) => `今日は${r}だよ！${c}のものと${i}を持っていくと、いいことがあるかも～`
};

// 簡單的字串雜湊（FNV-1a）→ 可重現的亂數；同一天、同一個人抽出來的結果永遠一樣。
function seededRandom(seedText) {
  let h = 2166136261;
  for (const ch of seedText) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

function drawCore(date, seedExtra, lang) {
  const rand = seededRandom(`${date}|${seedExtra}`);
  const total = RANKS.reduce((s, [, w]) => s + w, 0);
  let roll = rand() * total;
  let rank = RANKS[RANKS.length - 1][0];
  for (const [id, w] of RANKS) {
    if ((roll -= w) < 0) {
      rank = id;
      break;
    }
  }
  const colorIdx = Math.floor(rand() * COLORS.zh.length);
  const itemIdx = Math.floor(rand() * ITEMS.zh.length);
  const number = 1 + Math.floor(rand() * 9);
  const L = lang === 'ja' ? 'ja' : 'zh';
  return { rank, rankText: RANK_TEXT[rank], color: COLORS[L][colorIdx], item: ITEMS[L][itemIdx], number };
}

/** 給聊天紀錄（也就是給之後的模型）看的一段文字。 */
export function fortuneSummary(f) {
  return `【今日占卜】${f.rankText}｜幸運色：${f.color}｜幸運物：${f.item}｜幸運數字：${f.number}\n${f.text}`;
}

/**
 * 今天的占卜。已經抽過就直接回傳（fresh: false）；還沒抽就抽一次、寫說明、存起來（fresh: true）。
 * 介面語言換了的話會用新語言重寫一次說明（抽籤結果不變）。
 */
const inFlight = new Map(); // 角色 id → 產生中的占卜

// 兩個分頁幾乎同時按占卜：共用同一次產生的結果，不會抽兩次、在聊天紀錄裡出現兩張卡片。
// 每個角色各自抽（種子含「認識那天」，不同角色同一天的結果也不一樣）。
export function getTodayFortune(now = new Date()) {
  const id = currentCharacterId();
  if (inFlight.has(id)) return inFlight.get(id);
  const job = drawTodayFortune(now).finally(() => inFlight.delete(id));
  inFlight.set(id, job);
  return job;
}

async function drawTodayFortune(now) {
  const date = localDateKey(now);
  const [state, profile] = await Promise.all([getState(), getProfile()]);
  const lang = profile.language === 'ja' ? 'ja' : 'zh';
  if (state.fortune?.date === date && state.fortune.lang === lang) {
    return { fortune: state.fortune, fresh: false };
  }
  const alreadyDrawnToday = state.fortune?.date === date;

  const core = drawCore(date, profile.firstMetAt || 'pokkatomo', lang);
  let text = '';
  let mood = 'joy';
  const fm = await getFmStatus();
  if (fm.available) {
    try {
      const weather = await getWeatherForPrompt();
      const instructions = [
        buildSystemPrompt({ profile, weather, now }),
        relationshipPromptLine(state, profile.firstMetAt, now)
      ].join('\n');
      const raw = await fmRespond({
        purpose: 'fortune',
        message:
          `（使用者按了「今日占卜」。）今天的占卜結果已經決定好了：運勢「${core.rankText}」，幸運色「${core.color}」，` +
          `幸運物「${core.item}」，幸運數字「${core.number}」。請用你的口吻，寫兩到三句占卜說明，` +
          '要可愛、正面，可以把使用者的喜好或今天的天氣自然地連結進來。不要改動上面的結果，也不要重複列出清單。',
        instructions,
        history: []
      });
      ({ text, mood } = parseMoodTag(raw));
    } catch (err) {
      log.warn('fortune_text_failed', { error: err.message });
    }
  }
  if (!text) text = FALLBACK_TEXT[lang](core.rankText, core.color, core.item);

  // createdAt 精確到秒（存檔的格式就是到秒，讀回來才會一模一樣）
  const fortune = { date, lang, ...core, text, mood, createdAt: Math.floor(Date.now() / 1000) * 1000 };
  await saveFortune(fortune);
  if (!alreadyDrawnToday) {
    await appendMessages([
      { role: 'assistant', content: fortuneSummary(fortune), kind: 'fortune', fortune, mood, ts: Date.now() }
    ]);
  }
  return { fortune, fresh: !alreadyDrawnToday };
}

// 這句話跟占卜／運勢有關嗎？（中文、日文、英文）
const FORTUNE_TOPIC_RE = /占卜|運勢|運氣|運気|幸運|籤|おみくじ|占い|うらない|ラッキー|fortune|luck/i;
export function isFortuneTopic(message) {
  return FORTUNE_TOPIC_RE.test(String(message || ''));
}

/**
 * 聊天時用：**只有使用者這句話提到占卜／運勢時**才把今天的結果（或「去按 🔮」）告訴模型。
 * 以前每一句都帶著今天的占卜，模型就三不五時提起「今天是小吉喔」，很煩。
 * @param {object} state 角色狀態（companionService）
 * @param {string} message 使用者這句話
 */
export function fortunePromptLine(state, message, now = new Date()) {
  if (!isFortuneTopic(message)) return '';
  const f = state?.fortune;
  if (f?.date === localDateKey(now)) {
    return `使用者問到運勢。今天已經幫她占卜過了：${f.rankText}，幸運色${f.color}，幸運物${f.item}，幸運數字${f.number}。以這個為準，不要另外編；回答完就好，之後不用再主動提。`;
  }
  return '使用者問到占卜或運勢，但今天還沒占卜：請她按畫面右上角的「🔮」按鈕，不要自己編造占卜結果。';
}
