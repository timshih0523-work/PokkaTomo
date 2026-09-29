// characterContext.js
// 「現在是在跟哪個角色互動」＋每個角色的檔案放在哪裡。
//
// 做法：AsyncLocalStorage。routes 的 middleware（routes/index.js）依請求的 X-PokkaTomo-Character 標頭
// 呼叫 withCharacter(id, next)，之後這個請求裡「所有」非同步工作（包括不 await 的背景記憶提取、補寫日記）
// 都會帶著同一個角色 id。各 service 用 charPaths() 算出檔案位置，不用每個函式都多傳一個參數。
// 不在請求裡的工作（伺服器啟動時補寫日記、自動備份）要自己用 withCharacter() 包起來。
//
// 資料夾（server/data/，詳見 README_TECH 4.10）：
//   app/security.json            密碼（全部角色共用）
//   app/characters.json          角色清單：順序＋編號＋名字（給人看的索引，名字以 character.json 為準）
//   characters/<編號>/           每個角色一個資料夾，裡面的檔案都一樣：
//     character.json             角色本身：名字、個性、說話的語言、外觀、毛色、聲音、建立／認識的日子
//     user.json                  這個角色認識的你：稱呼、介面語言、城市、喜好、紀念日
//     state.json                 親密度、今天的計數、睡覺／出門、今天的占卜
//     diary.json                 日記
//     conversations/YYYY-MM.jsonl  全部對話（唯一一份，只追加）
//   編號是 001、002…（不用名字當資料夾名：改名時不用搬資料夾）。

import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';

import { DATA_DIR } from '../config.js';

export const APP_DIR = path.join(DATA_DIR, 'app');
export const CHARACTERS_DIR = path.join(DATA_DIR, 'characters');
export const CHARACTER_INDEX_PATH = path.join(APP_DIR, 'characters.json');
export const SECURITY_PATH = path.join(APP_DIR, 'security.json');

const ID_RE = /^[a-z0-9-]{1,40}$/;

const als = new AsyncLocalStorage();

// 沒指定角色時用哪一個（＝清單裡第一個；characterService 讀清單時更新）
let fallbackId = '001';
export function setFallbackCharacterId(id) {
  if (isValidCharacterId(id)) fallbackId = id;
}

export function isValidCharacterId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/** 在指定角色底下執行 fn（fn 裡面的所有非同步工作都算這個角色的）。 */
export function withCharacter(id, fn) {
  return als.run({ characterId: isValidCharacterId(id) ? id : fallbackId }, fn);
}

export function currentCharacterId() {
  return als.getStore()?.characterId || fallbackId;
}

/** 某個角色的資料夾。 */
export function characterDir(id = currentCharacterId()) {
  return path.join(CHARACTERS_DIR, id);
}

/** 某個角色（預設＝目前角色）的各個資料檔位置。 */
export function charPaths(id = currentCharacterId()) {
  const dir = characterDir(id);
  return {
    id,
    dir,
    character: path.join(dir, 'character.json'),
    user: path.join(dir, 'user.json'),
    state: path.join(dir, 'state.json'),
    diary: path.join(dir, 'diary.json'),
    conversationsDir: path.join(dir, 'conversations')
  };
}
