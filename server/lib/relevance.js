// relevance.js
// 「記在心上，聊到相關的才提起」：使用者的喜好、紀念日不再每一句都塞進 prompt。
//
// 以前 prompt 每一句都寫著「使用者的喜好：…，找機會自然提到」「重要紀念日：…」，
// Apple 的小模型把「找機會」理解成「每次都要講」，結果每句話都在講幸運色、520 紀念日。
// 現在只有這句話跟某個喜好／紀念日有關時，才把那一項放進 prompt（其他的牠不知道，自然不會提）。

import { normalizeText, tokenize } from './textIndex.js';

const ASK_PREFERENCES_RE = /喜好|喜歡什麼|喜歡的東西|愛吃什麼|我喜歡|好きなもの|好み|何が好き|好物/;
const ANNIVERSARY_WORD_RE = /紀念日|記念日|纪念日|週年|周年|anniversary|生日|誕生日|たんじょうび/i;

// 一段文字跟使用者這句話有沒有關係：整個詞出現在句子裡（「貓」），或有共同的詞（bigram）
function related(text, message) {
  const t = normalizeText(text);
  const m = normalizeText(message);
  if (!t || !m) return false;
  if (m.includes(t) || (t.length >= 2 && t.includes(m) && m.length >= 2)) return true;
  const mt = new Set(tokenize(message));
  return tokenize(text).some((tok) => mt.has(tok));
}

/**
 * 跟這句話有關的喜好。問「我喜歡什麼」之類的就全部給。
 * @param {string[]} preferences
 * @param {string} message
 */
export function relevantPreferences(preferences, message) {
  if (!Array.isArray(preferences) || !preferences.length || !message) return [];
  if (ASK_PREFERENCES_RE.test(message)) return preferences;
  return preferences.filter((p) => related(p, message));
}

// 句子裡寫到這個月日了嗎：5/20、5月20、05-20、520、0520
function mentionsMonthDay(message, month, day) {
  const m = String(message).normalize('NFKC');
  const withSep = new RegExp(`(?<!\\d)0?${month}\\s*[/月\\-.]\\s*0?${day}(?!\\d)`);
  const compact = new RegExp(`(?<!\\d)0?${month}${String(day).padStart(2, '0')}(?!\\d)`);
  return withSep.test(m) || compact.test(m);
}

function daysUntil(dateStr, now) {
  const [, mo, d] = dateStr.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), mo - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, mo - 1, d);
  return Math.round((next - today) / 86400000);
}

/**
 * 要讓角色知道的紀念日：
 *   - 今天或 3 天內（可以主動提一次）→ soon
 *   - 這句話問到紀念日／生日、寫到那個日期、或提到紀念日的名字 → asked
 * @returns {Array<{ name, date, noYear?, daysUntil: number }>}
 */
export function relevantAnniversaries(anniversaries, message, now = new Date()) {
  if (!Array.isArray(anniversaries)) return [];
  const askAll = !!message && ANNIVERSARY_WORD_RE.test(message);
  const out = [];
  for (const a of anniversaries) {
    if (!a?.date || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) continue;
    const [, mo, d] = a.date.split('-').map(Number);
    const du = daysUntil(a.date, now);
    const hit =
      du <= 3 ||
      askAll ||
      (message && (mentionsMonthDay(message, mo, d) || related(a.name.replace(/紀念日|記念日/g, ''), message)));
    if (hit) out.push({ ...a, daysUntil: du });
  }
  return out;
}
