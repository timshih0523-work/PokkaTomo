// historyService.js
// 對話紀錄的讀寫入口（實際存在 archiveService 的 conversations/YYYY-MM.jsonl，唯一一份），
// 以及「關鍵記憶提取」：每輪對話結束後，另外呼叫一次 fm，
// 請它從使用者的話裡找出值得長期記住的喜好／紀念日，寫回 user.json。

import { fmRespond, runBackgroundFm } from './fmService.js';
import { updateProfile } from './profileService.js';
import { log } from './lib/logger.js';
import { appendToArchive, readRecent } from './archiveService.js';
import { HISTORY_MAX_STORED_MESSAGES, PROFILE_MAX_PREFERENCES } from './config.js';

/** 最近的對話（最多 HISTORY_MAX_STORED_MESSAGES 則，日記、主動問候要看「今天聊過什麼」時用）。 */
export function getAllHistory() {
  return readRecent(HISTORY_MAX_STORED_MESSAGES);
}

export function getRecentHistory(limit = 20) {
  return readRecent(limit);
}

/** 追加訊息（同一個角色的寫入會排隊，不會互相蓋掉）。回傳實際寫入的紀錄。 */
export function appendMessages(messages) {
  return appendToArchive(messages);
}

// 請 fm 只回傳一段固定格式的 JSON，方便程式解析。故意不用「請用中文/日文回覆」這種
// 使用者語言指示——這個提示是給程式解析用的，跟 buildSystemPrompt() 給使用者看的人設是分開的兩件事。
const EXTRACTION_INSTRUCTIONS = `你是一個記憶擷取小助手，不是在跟使用者聊天。
接下來提供的是「使用者自己說的一句話」。找出裡面使用者親口說出、值得長期記住的新資訊。
只能根據這句話裡明確出現的內容，不要猜測、不要憑空發明。
使用者只是附和、回應、稱讚（例如「很可愛」「好啊」「對啊」）的話，不算他的喜好。

只能回傳這種格式的 JSON，不要加任何其他文字、不要用 markdown code block、不要有註解：
{"preferences": ["..."], "anniversaries": [{"name": "...", "date": "YYYY-MM-DD 或 MM-DD"}]}

規則：
- preferences 只放具體的喜好（食物、興趣、寵物、顏色等），不要放情緒或一次性的事件。
- anniversaries 的 date：有年份寫 YYYY-MM-DD；只有月跟日（例如「5/20」「5月20日」「520」）寫 MM-DD（例如 05-20）；
  只有月份（例如只說「五月」）或不確定的，這筆就不要放。name 寫這是什麼紀念日（例如「交往紀念日」）。
- 如果這輪對話沒有任何值得記住的新資訊，兩個陣列都留空：{"preferences": [], "anniversaries": []}`;

/**
 * 「關鍵記憶提取」：對一輪對話（通常是最新的使用者訊息 + AI 回覆）另外呼叫一次 fm，
 * 請它抓出可以長期記住的喜好/紀念日，成功的話直接合併寫回 user.json。
 *
 * 設計成不會拖慢主要對話：這個函式本身可能要等 fm 跑完（可能要幾秒），
 * 所以 routes/chat.js 是用「不 await、fire-and-forget」的方式呼叫它，
 * 使用者不會因為記憶提取而多等。任何失敗（fm 掛掉、回傳不是合法 JSON）都靜靜放棄，
 * 不影響下一輪對話。
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} recentMessages
 * @returns {Promise<{preferences: string[], anniversaries: Array<{name: string, date: string}>}>}
 */
export async function extractFacts(recentMessages) {
  const empty = { preferences: [], anniversaries: [] };
  if (!Array.isArray(recentMessages) || recentMessages.length === 0) return empty;

  // 只看使用者自己說的話。以前角色的回覆也一起送進來，結果角色說的「今天的幸運色是珊瑚橘」
  // 被當成使用者的喜好存了起來（使用者從來沒說過喜歡珊瑚色），之後每句話都被提起。
  const transcript = recentMessages
    .filter((m) => m.role === 'user')
    .map((m) => String(m.content))
    .join('\n');
  if (!transcript.trim()) return empty;

  let raw;
  try {
    // 排進背景 fm 佇列（跟寫日記共用），一次只跑一個背景推論，不跟使用者正在等的回覆搶資源。
    raw = await runBackgroundFm(() =>
      fmRespond({ purpose: 'extract', message: transcript, instructions: EXTRACTION_INSTRUCTIONS, history: [] })
    );
  } catch (err) {
    log.warn('extract_facts_failed', { error: err.message });
    return empty;
  }

  const parsed = parseFactJson(raw);
  if (!parsed) return empty;

  if (parsed.preferences.length > 0 || parsed.anniversaries.length > 0) {
    await mergeFactsIntoProfile(parsed);
  }
  return parsed;
}

// 紀念日日期：YYYY-MM-DD 照存；只有月日（MM-DD、--MM-DD）的存成「今年的那天」並標 noYear
// （畫面上就不會算「第幾年」）。其他格式、不存在的日期（02-30）丟掉。
export function normalizeAnniversaryDate(name, date, now = new Date()) {
  let y;
  let m;
  let d;
  let noYear = false;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  if (hit) [, y, m, d] = hit.map(Number);
  else if ((hit = /^-{0,2}(\d{1,2})-(\d{1,2})$/.exec(date))) {
    [, m, d] = hit.map(Number);
    y = now.getFullYear();
    noYear = true;
  } else return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const out = { name, date: `${y}-${pad(m)}-${pad(d)}` };
  if (noYear) out.noYear = true;
  return out;
}

function parseFactJson(raw) {
  if (!raw) return null;
  // 模型有時候會在 JSON 外面多包一些文字或 code fence，抓第一個 { 到最後一個 } 之間的內容再試著解析。
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const obj = JSON.parse(match[0]);
    const preferences = Array.isArray(obj.preferences)
      ? obj.preferences.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim())
      : [];
    const anniversaries = Array.isArray(obj.anniversaries)
      ? obj.anniversaries
          .filter((a) => a && typeof a.name === 'string' && a.name.trim() && typeof a.date === 'string')
          .map((a) => normalizeAnniversaryDate(a.name.trim(), a.date.trim()))
          .filter(Boolean)
      : [];
    return { preferences, anniversaries };
  } catch {
    return null;
  }
}

async function mergeFactsIntoProfile({ preferences, anniversaries }) {
  // 用 updateProfile()：讀取現在的 profile、算出合併結果、寫回這三步驟會被當成
  // 一個不會被插隊的單位執行。原本這裡是分開呼叫 getProfile() 再呼叫 saveProfile()，
  // 如果剛好使用者同時在設定面板按「儲存」，兩次呼叫各自讀到舊資料、各自寫回，
  // 其中一邊的修改就會憑空消失（例如剛存好的暱稱被記憶提取的舊資料蓋掉，或反過來）。
  await updateProfile((profile) => {
    const existingPrefs = new Set(Array.isArray(profile.preferences) ? profile.preferences : []);
    for (const p of preferences) existingPrefs.add(p);
    const nextPreferences = Array.from(existingPrefs).slice(-PROFILE_MAX_PREFERENCES);

    const nextAnniversaries = Array.isArray(profile.anniversaries) ? [...profile.anniversaries] : [];
    for (const a of anniversaries) {
      const idx = nextAnniversaries.findIndex((e) => e.name === a.name);
      if (idx === -1) nextAnniversaries.push({ ...a });
      else nextAnniversaries[idx] = { ...a }; // 同名的話用新日期覆蓋
    }

    return { preferences: nextPreferences, anniversaries: nextAnniversaries };
  });
}
