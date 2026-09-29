// profileService.js
// 讀寫 profile。全部都跟著角色走（每個角色資料夾各一份，見 lib/characterContext.js）：
//   - user.json：這個角色認識的你——稱呼、介面語言、城市、喜好、紀念日
//   - character.json：角色本身——名字、說話的語言、個性、外觀、毛色、聲音、認識那天（characterService.js）
// getProfile() 把兩邊合成一個物件，saveProfile() 自動拆開存。
// profile 物件對外沿用舊的欄位名（companionName＝角色名字），prompt、日記、前端設定面板不用知道檔案怎麼分。

import { LIMITS } from './config.js';
import { DEFAULT_COMPANION_NAME, defaultPersonaFor, isDefaultPersona, getCharacter, updateCharacter, sanitizeCharacterFields, AVATAR_STYLES, PALETTES } from './characterService.js';
import { currentCharacterId, charPaths } from './lib/characterContext.js';

import { enqueue } from './lib/asyncQueue.js';
import { readJson, writeJsonAtomic } from './lib/jsonStore.js';
import { NoCharacterError } from './lib/errors.js';

const userPath = () => charPaths().user;

export { DEFAULT_COMPANION_NAME, DEFAULT_PERSONA } from './characterService.js';

/** 角色現在的名字（沒設定就用預設的 PokkaTomo）。 */
export function companionNameOf(profile) {
  return (typeof profile?.companionName === 'string' && profile.companionName.trim()) || DEFAULT_COMPANION_NAME;
}

// 新角色（或 user.json 還不存在）時的使用者資料：稱呼「主人」、其他全部空白（不從任何角色複製）。
export const DEFAULT_NICKNAMES = { zh: '主人', ja: 'ご主人さま' };
export function freshProfile(language = 'zh') {
  return {
    nickname: DEFAULT_NICKNAMES[language] || DEFAULT_NICKNAMES.zh,
    // 介面「顯示的語言」：可以隨時切換（上方 🌐 按鈕），null = 跟角色說話的語言一樣
    uiLanguage: null,
    // 天氣用的地點（設定面板填城市），null = 沒設定、不顯示天氣
    location: null,
    preferences: [],
    anniversaries: []
  };
}
const USER_FIELDS = ['nickname', 'uiLanguage', 'location', 'preferences', 'anniversaries'];

// 屬於「角色」的欄位（存在 character.json）。language 只在新增角色時決定，這裡不接受修改。
const CHARACTER_FIELDS = ['companionName', 'personaPrompt', 'avatarStyle', 'palette', 'firstMetAt', 'voice', 'voicePitch', 'voiceRate'];

async function readUserFile(language) {
  const stored = await readJson(userPath(), () => null);
  const base = freshProfile(language);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return base;
  const out = { ...base };
  for (const k of USER_FIELDS) if (k in stored) out[k] = stored[k];
  return out;
}

/**
 * 目前的 profile＝這個角色認識的你（user.json）＋角色本身（character.json）。
 * 檔案不存在或壞掉時的處理（含壞檔備份）在 lib/jsonStore.js。
 */
export async function getProfile() {
  const ch = await getCharacter(currentCharacterId());
  if (!ch) throw new NoCharacterError();
  const user = await readUserFile(ch.language);
  return {
    ...user,
    language: ch.language,
    uiLanguage: user.uiLanguage || ch.language,
    characterId: ch.id,
    companionName: ch.name,
    // 沒改過的預設個性一律用這個角色語言的版本
    personaPrompt: isDefaultPersona(ch.personaPrompt) ? defaultPersonaFor(ch.language) : ch.personaPrompt,
    avatarStyle: ch.avatarStyle,
    palette: ch.palette,
    firstMetAt: ch.firstMetAt,
    voice: ch.voice,
    voicePitch: ch.voicePitch,
    voiceRate: ch.voiceRate
  };
}

// 寫 user.json：只寫使用者的欄位，欄位順序固定
async function writeUserPart(userPart, language) {
  const current = await readUserFile(language);
  const next = { ...current, ...userPart };
  const out = {};
  for (const k of USER_FIELDS) out[k] = next[k];
  return writeJsonAtomic(userPath(), out);
}

function splitPartial(sanitized) {
  const userPart = {};
  const charPart = {};
  for (const [k, v] of Object.entries(sanitized)) {
    if (k === 'companionName') charPart.name = v;
    else if (CHARACTER_FIELDS.includes(k)) charPart[k] = v;
    else if (USER_FIELDS.includes(k)) userPart[k] = v;
  }
  return { userPart, charPart };
}

async function applyPartial(sanitized) {
  const { userPart, charPart } = splitPartial(sanitized);
  if (Object.keys(userPart).length) {
    const ch = await getCharacter(currentCharacterId());
    if (!ch) throw new NoCharacterError();
    await writeUserPart(userPart, ch.language);
  }
  if (Object.keys(charPart).length) await updateCharacter(currentCharacterId(), charPart);
  return getProfile();
}

// 之前 /api/profile 完全沒有做伺服器端驗證：設定面板的 UI 雖然有限制字數
// （例如 personaPrompt 150 字），但那只是前端擋，任何人直接打 POST /api/profile
// 都可以塞進超長字串、非字串的欄位、超多筆紀念日等等——這些壞資料會被存進
// user.json，之後每次 buildSystemPrompt() 組 prompt 都會帶著壞資料送給 fm，
// 也可能讓設定面板下次打開時整個顯示異常。
//
// 這裡統一做「淨化」而不是直接整包拒絕：型別不對或格式不合法的欄位就跳過（保留原本
// 舊值），字串類的欄位做 trim + 長度上限，陣列類的做數量上限，這樣使用者體驗上
// 頂多是「這個欄位沒存到」，不會因為一個壞欄位就讓整個儲存失敗、跳一個看不懂的錯誤。
// language 刻意不檢查是不是 'zh'/'ja' 這種白名單——這個專案的設計原則是「加新語言
// 只需要改 web/src/i18n.js 一個檔案」，後端如果也寫死語言清單，之後加語言就要兩邊一起改，
// 違反這個原則；這裡只做基本的型別 + 長度防呆。
// 字數上限統一定義在 config.js 的 LIMITS（前端透過 GET /api/config 拿同一份），這裡不再自己寫數字。
const NICKNAME_MAX_LEN = LIMITS.nickname;
const COMPANION_NAME_MAX_LEN = LIMITS.companionName;
const PERSONA_MAX_LEN = LIMITS.persona;
const PREFERENCES_MAX_COUNT = LIMITS.preferencesCount;
const PREFERENCE_MAX_LEN = LIMITS.preference;
const ANNIVERSARIES_MAX_COUNT = LIMITS.anniversariesCount;
const ANNIVERSARY_NAME_MAX_LEN = LIMITS.anniversaryName;
const LANGUAGE_MAX_LEN = 10;
const ANNIVERSARY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizePartialProfile(partial) {
  if (!partial || typeof partial !== 'object') return {};
  const next = {};

  if (typeof partial.nickname === 'string') {
    next.nickname = partial.nickname.trim().slice(0, NICKNAME_MAX_LEN);
  }

  if (typeof partial.companionName === 'string') {
    next.companionName = partial.companionName.trim().slice(0, COMPANION_NAME_MAX_LEN);
  }

  if (typeof partial.personaPrompt === 'string') {
    next.personaPrompt = partial.personaPrompt.trim().slice(0, PERSONA_MAX_LEN);
  }

  if (Array.isArray(partial.preferences)) {
    next.preferences = partial.preferences
      .filter((p) => typeof p === 'string' && p.trim())
      .map((p) => p.trim().slice(0, PREFERENCE_MAX_LEN))
      .slice(0, PREFERENCES_MAX_COUNT);
  }

  if (Array.isArray(partial.anniversaries)) {
    next.anniversaries = partial.anniversaries
      .filter((a) => a && typeof a.name === 'string' && a.name.trim() && ANNIVERSARY_DATE_RE.test(a.date))
      // noYear：使用者只說了月日（例如「520 是紀念日」），不知道是哪一年開始的 → 畫面上不算「第幾年」
      .map((a) => ({ name: a.name.trim().slice(0, ANNIVERSARY_NAME_MAX_LEN), date: a.date, ...(a.noYear === true ? { noYear: true } : {}) }))
      .slice(0, ANNIVERSARIES_MAX_COUNT);
  }

  // 天氣用的地點（routes/weather.js 查好經緯度後寫入）；null = 清除地點、不顯示天氣。
  if (partial.location === null) {
    next.location = null;
  } else if (
    partial.location &&
    typeof partial.location === 'object' &&
    Number.isFinite(partial.location.latitude) &&
    Number.isFinite(partial.location.longitude)
  ) {
    const str = (v) => (typeof v === 'string' ? v.trim().slice(0, LIMITS.city) : '');
    next.location = {
      query: str(partial.location.query),
      name: str(partial.location.name),
      admin1: str(partial.location.admin1),
      country: str(partial.location.country),
      latitude: partial.location.latitude,
      longitude: partial.location.longitude
    };
  }

  // 第一次聊天的日期（routes/chat.js 寫入一次），日記面板用來顯示「認識第 N 天」。
  if (typeof partial.firstMetAt === 'string' && ANNIVERSARY_DATE_RE.test(partial.firstMetAt)) {
    next.firstMetAt = partial.firstMetAt;
  }

  // 角色外觀：full = 全身角色（預設）、classic = 原本的圓滾滾 Q 版；毛色
  if (AVATAR_STYLES.includes(partial.avatarStyle)) next.avatarStyle = partial.avatarStyle;
  if (PALETTES.includes(partial.palette)) next.palette = partial.palette;
  // 聲音（角色的欄位，淨化規則在 characterService）
  const voice = sanitizeCharacterFields(partial);
  for (const k of ['voice', 'voicePitch', 'voiceRate']) if (k in voice) next[k] = voice[k];

  // language（角色說話的語言）不在這裡：只在新增角色時決定（characterService.createCharacter）
  if (typeof partial.uiLanguage === 'string' && partial.uiLanguage.trim()) {
    next.uiLanguage = partial.uiLanguage.trim().slice(0, LANGUAGE_MAX_LEN);
  }

  return next;
}

// 用 enqueue() 把「讀取現在的 profile → 跟 partial 合併 → 寫回」包成一個不會被插隊的單位，
// 避免跟另一次 saveProfile()/updateProfile() 呼叫同時讀到同一份舊資料，各自寫回，
// 其中一邊的修改被蓋掉。partial 一律先經過 sanitizePartialProfile() 淨化。
export function saveProfile(partial) {
  const sanitized = sanitizePartialProfile(partial);
  return enqueue(userPath(), () => applyPartial(sanitized));
}

/**
 * 給需要「先讀最新的 profile、依內容算出要改哪些欄位、再寫回」的呼叫端用
 * （目前是 historyService 的關鍵記憶提取），讀取、計算、寫回這三步驟會排在同一個佇列裡
 * 整個當成一個單位執行，不會被別的 saveProfile()/updateProfile() 呼叫插隊在中間，
 * 才不會發生「用舊資料算出來的結果，蓋掉了插隊那次寫入的新資料」這種難以察覺的遺失更新。
 * updater 算出來的結果一樣會經過 sanitizePartialProfile()，跟 saveProfile() 走同一道關卡。
 * @param {(profile: object) => (object | Promise<object>)} updater 回傳要合併進 profile 的欄位
 */
export function updateProfile(updater) {
  return enqueue(userPath(), async () => {
    const current = await getProfile();
    const partial = await updater(current);
    return applyPartial(sanitizePartialProfile(partial));
  });
}
