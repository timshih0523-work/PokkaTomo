// characterService.js
// 角色：每個角色一個資料夾 server/data/characters/<編號>/，角色本身的設定在裡面的 character.json：
//   { id, name, language, personaPrompt, avatarStyle, palette, outfit, voice, voicePitch, voiceRate, firstMetAt, createdAt }
//   outfit＝衣櫥的穿搭 { head, neck, body, face }（lib/wardrobe.js）
// 另外 server/data/app/characters.json 是「角色清單」：順序＋編號＋名字，給人一眼看出有哪些角色
// （程式的名字以 character.json 為準，改名時兩邊一起寫）。
// 使用者資料（稱呼、喜好、紀念日、城市、介面語言）在同一個資料夾的 user.json（profileService.js）。

import { readdir } from 'fs/promises';

import { LIMITS } from './config.js';
import { enqueue } from './lib/asyncQueue.js';
import { readJson, writeJsonAtomic } from './lib/jsonStore.js';
import {
  CHARACTERS_DIR,
  CHARACTER_INDEX_PATH,
  charPaths,
  isValidCharacterId,
  setFallbackCharacterId
} from './lib/characterContext.js';
import { toLocalIso, parseTime } from './lib/time.js';
import { log } from './lib/logger.js';
import { sanitizeOutfit } from './lib/wardrobe.js';

// 預設個性描述裡「不要」寫死名字：名字由 buildSystemPrompt() 依角色名字另外加一行。
export const DEFAULT_COMPANION_NAME = 'PokkaTomo';
export const DEFAULT_PERSONA =
  '你是使用者最親近的小夥伴，個性活潑、好奇、有點愛撒嬌，也很會關心人。你有自己的感受和小意見，會開心、會害羞、會吐槽，偶爾開個小玩笑。';
// 日文角色的預設個性
export const DEFAULT_PERSONA_JA =
  'あなたはユーザーのいちばん身近な相棒。明るくて好奇心いっぱい、ちょっと甘えんぼで、相手のことをよく気にかける。自分の気持ちや意見もあって、喜んだり、照れたり、ツッコんだり、たまに冗談も言う。';
const DEFAULT_PERSONAS = { zh: DEFAULT_PERSONA, ja: DEFAULT_PERSONA_JA };
/** 某個語言的預設個性（不認得的語言用中文的）。 */
export const defaultPersonaFor = (language) => DEFAULT_PERSONAS[language] || DEFAULT_PERSONA;
/** 是不是「沒改過的預設個性」（任何語言的）。使用者自己寫的不算。 */
export const isDefaultPersona = (text) => Object.values(DEFAULT_PERSONAS).includes(text);

export const LANGUAGES = ['zh', 'ja'];
export const AVATAR_STYLES = ['full', 'classic'];
// 毛色（前端 web/src/palettes.js 有對應的顏色，測試會檢查兩邊一樣）
export const PALETTES = ['peach', 'cocoa', 'cream', 'mint', 'sakura', 'gray'];
export const MAX_CHARACTERS = 12;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_NUM_RE = /^\d{3,}$/;

// 檔案內容 → 程式裡用的角色物件（缺的欄位補預設值；createdAt 在程式裡是毫秒數字或 null）
function normalize(c, id) {
  const language = LANGUAGES.includes(c?.language) ? c.language : 'zh';
  const persona = typeof c?.personaPrompt === 'string' && c.personaPrompt.trim() ? c.personaPrompt : defaultPersonaFor(language);
  return {
    id,
    name: typeof c?.name === 'string' ? c.name : '',
    language,
    personaPrompt: persona,
    avatarStyle: AVATAR_STYLES.includes(c?.avatarStyle) ? c.avatarStyle : 'full',
    palette: PALETTES.includes(c?.palette) ? c.palette : 'peach',
    outfit: sanitizeOutfit(c?.outfit),
    voice: typeof c?.voice === 'string' ? c.voice : '',
    voicePitch: Number.isFinite(c?.voicePitch) ? c.voicePitch : 1.05,
    voiceRate: Number.isFinite(c?.voiceRate) ? c.voiceRate : 1.0,
    firstMetAt: typeof c?.firstMetAt === 'string' && DATE_RE.test(c.firstMetAt) ? c.firstMetAt : null,
    createdAt: parseTime(c?.createdAt)
  };
}

// 程式裡的角色物件 → 寫進 character.json 的樣子（欄位順序固定、時間用人看得懂的格式）
function toFile(c) {
  return {
    id: c.id,
    name: c.name,
    language: c.language,
    personaPrompt: c.personaPrompt,
    avatarStyle: c.avatarStyle,
    palette: c.palette,
    outfit: c.outfit,
    voice: c.voice,
    voicePitch: c.voicePitch,
    voiceRate: c.voiceRate,
    firstMetAt: c.firstMetAt,
    createdAt: toLocalIso(c.createdAt)
  };
}

const clampNum = (n, min, max) => Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;

/** 角色欄位的淨化（名字、個性、外觀、毛色、聲音、認識那天）。不認得／格式錯的欄位忽略。語言只在新增時給。 */
export function sanitizeCharacterFields(partial) {
  const next = {};
  if (!partial || typeof partial !== 'object') return next;
  if (typeof partial.name === 'string') next.name = partial.name.trim().slice(0, LIMITS.companionName);
  if (typeof partial.personaPrompt === 'string') next.personaPrompt = partial.personaPrompt.trim().slice(0, LIMITS.persona);
  if (AVATAR_STYLES.includes(partial.avatarStyle)) next.avatarStyle = partial.avatarStyle;
  if (PALETTES.includes(partial.palette)) next.palette = partial.palette;
  // 衣櫥：整組送（四個部位），不認得的值當成「自動」
  if (partial.outfit && typeof partial.outfit === 'object' && !Array.isArray(partial.outfit)) next.outfit = sanitizeOutfit(partial.outfit);
  if (typeof partial.firstMetAt === 'string' && DATE_RE.test(partial.firstMetAt)) next.firstMetAt = partial.firstMetAt;
  // 聲音：瀏覽器的 voiceURI（空字串 = 自動挑最好的）、音高、語速。說話的語言固定，所以只要一個聲音。
  if (typeof partial.voice === 'string') next.voice = partial.voice.trim().slice(0, 200);
  if (Number.isFinite(partial.voicePitch)) next.voicePitch = clampNum(partial.voicePitch, 0.6, 1.6);
  if (Number.isFinite(partial.voiceRate)) next.voiceRate = clampNum(partial.voiceRate, 0.7, 1.4);
  return next;
}

async function readCharacterFile(id) {
  const raw = await readJson(charPaths(id).character, () => null);
  return raw && typeof raw === 'object' ? normalize(raw, id) : null;
}

// 角色清單的順序：app/characters.json；沒有（或壞掉）時照資料夾編號排
async function readIndexIds() {
  const idx = await readJson(CHARACTER_INDEX_PATH, () => null);
  if (Array.isArray(idx)) {
    const ids = idx.map((e) => e?.id).filter(isValidCharacterId);
    if (ids.length) return ids;
  }
  try {
    return (await readdir(CHARACTERS_DIR)).filter(isValidCharacterId).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeIndex(list) {
  await writeJsonAtomic(CHARACTER_INDEX_PATH, list.map((c) => ({ id: c.id, name: c.name })));
}

async function readAll() {
  const list = [];
  for (const id of await readIndexIds()) {
    const c = await readCharacterFile(id);
    if (c) list.push(c);
  }
  // 一個角色都沒有（全新安裝、全部刪掉）就回傳空清單：不自動建立角色，
  // 使用者自己在選角色畫面新增（新增時才套用預設值，見 createCharacter／profileService.freshProfile）
  if (list.length) setFallbackCharacterId(list[0].id);
  return list;
}

// 角色清單的增刪改都排同一個隊
function update(mutator) {
  return enqueue(CHARACTER_INDEX_PATH, async () => {
    const list = await readAll();
    return mutator(list);
  });
}

/** 全部角色（清單順序）。 */
export function listCharacters() {
  return enqueue(CHARACTER_INDEX_PATH, readAll);
}

/** 找不到（被刪掉、亂傳 id）時回傳第一個角色；一個角色都沒有時回傳 undefined。 */
export async function getCharacter(id) {
  const list = await listCharacters();
  return list.find((c) => c.id === id) || list[0];
}

export async function characterExists(id) {
  return (await listCharacters()).some((c) => c.id === id);
}

async function nextId() {
  let max = 0;
  try {
    for (const n of await readdir(CHARACTERS_DIR)) if (ID_NUM_RE.test(n)) max = Math.max(max, Number(n));
  } catch {
    /* 還沒有資料夾 */
  }
  return String(max + 1).padStart(3, '0');
}

/**
 * 新增角色。說話的語言在這裡決定（之後不能改）；個性用那個語言的預設。
 * @param {{ name?: string, avatarStyle?: string, palette?: string, language?: string }} fields
 */
export function createCharacter(fields) {
  const clean = sanitizeCharacterFields(fields);
  const language = LANGUAGES.includes(fields?.language) ? fields.language : 'zh';
  return update(async (list) => {
    if (list.length >= MAX_CHARACTERS) {
      const err = new Error(`角色最多 ${MAX_CHARACTERS} 個`);
      err.code = 'too_many';
      throw err;
    }
    const id = await nextId();
    const c = normalize({ ...clean, language, personaPrompt: clean.personaPrompt || defaultPersonaFor(language), firstMetAt: null, createdAt: Date.now() }, id);
    await writeJsonAtomic(charPaths(id).character, toFile(c));
    await writeIndex([...list, c]);
    log.info('character_created', { id });
    return c;
  });
}

/** 更新角色欄位；角色不存在時回傳 null。 */
export function updateCharacter(id, fields) {
  const clean = sanitizeCharacterFields(fields);
  return update(async (list) => {
    const i = list.findIndex((c) => c.id === id);
    if (i === -1) return null;
    const next = normalize({ ...toFile(list[i]), ...clean }, id);
    await writeJsonAtomic(charPaths(id).character, toFile(next));
    if (next.name !== list[i].name) {
      list[i] = next;
      await writeIndex(list);
    }
    return next;
  });
}

/**
 * 從角色清單拿掉（資料夾的處理在 dataAdminService.deleteCharacter）。最後一個也可以刪（刪完回到「還沒有角色」）。
 * @returns {Promise<object|null>} 被拿掉的角色；找不到回傳 null
 */
export function removeCharacter(id) {
  return update(async (list) => {
    const i = list.findIndex((c) => c.id === id);
    if (i === -1) return null;
    const [removed] = list.splice(i, 1);
    await writeIndex(list);
    if (list.length) setFallbackCharacterId(list[0].id);
    log.info('character_removed', { id });
    return removed;
  });
}

/**
 * 調整角色順序（選角色畫面拖曳）。ids 要剛好是現有的角色（順序不同）；不認得的忽略、漏掉的接在後面。
 * @returns {Promise<object[]>} 新順序的角色清單
 */
export function reorderCharacters(ids) {
  return update(async (list) => {
    const byId = new Map(list.map((c) => [c.id, c]));
    const seen = new Set();
    const next = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (byId.has(id) && !seen.has(id)) {
        next.push(byId.get(id));
        seen.add(id);
      }
    }
    for (const c of list) if (!seen.has(c.id)) next.push(c);
    await writeIndex(next);
    if (next.length) setFallbackCharacterId(next[0].id);
    log.info('characters_reordered', { order: next.map((c) => c.id) });
    return next;
  });
}

/** 角色的顯示名字（沒取名就用預設）。 */
export function characterNameOf(c) {
  return (typeof c?.name === 'string' && c.name.trim()) || DEFAULT_COMPANION_NAME;
}
