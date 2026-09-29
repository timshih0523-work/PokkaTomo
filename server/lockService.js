// lockService.js
// 四位數密碼鎖。目的是「防君子」：別人（或她自己不在時）打開畫面看不到對話，
// 不是資安等級的保護——資料檔本身沒有加密，開發者需要時還是可以直接看 server/data/。
//
//   - 密碼不存明碼：scrypt 雜湊＋隨機 salt，存在 server/data/app/security.json
//   - 輸入正確後發一組隨機 token（只存在伺服器記憶體），之後的 API 都要帶（X-PokkaTomo-Token）
//     → 沒輸入密碼的人直接打 API 也讀不到對話、日記（見 lib/lockGuard.js）
//   - token 20 分鐘沒有任何請求就失效；伺服器重開也全部失效（要重新輸入）
//     （前端自己 15 分鐘沒操作就會蓋上密碼畫面，見 web/src/App.vue）
//   - 連續輸錯 5 次要等 1 分鐘
//   - 忘記密碼：開發者刪掉 server/data/app/security.json，下次打開會請她重新設定（對話等資料不受影響）

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

import { SECURITY_PATH } from './lib/characterContext.js';
import { toLocalIso } from './lib/time.js';
import { enqueue } from './lib/asyncQueue.js';
import { readJson, writeJsonAtomic } from './lib/jsonStore.js';
import { AppError, BadRequestError } from './lib/errors.js';
import { log } from './lib/logger.js';

const PIN_RE = /^\d{4}$/;
export const SESSION_IDLE_MS = 20 * 60 * 1000;
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 60 * 1000;

const sessions = new Map(); // token → 最後一次使用的時間
let failures = 0;
let lockedUntil = 0;

export class WrongPinError extends AppError {
  constructor(attemptsLeft) {
    super('密碼不對', { status: 401, code: 'wrong_pin' });
    this.attemptsLeft = attemptsLeft;
  }
}
export class TooManyAttemptsError extends AppError {
  constructor(retryAfterSec) {
    super('輸錯太多次，請稍等再試', { status: 429, code: 'too_many_attempts' });
    this.retryAfterSec = retryAfterSec;
  }
}

function hash(pin, salt) {
  return scryptSync(pin, salt, 32).toString('hex');
}

async function readSecurity() {
  const s = await readJson(SECURITY_PATH, () => null);
  return s && typeof s.pinHash === 'string' && typeof s.salt === 'string' ? s : null;
}

function assertPinFormat(pin) {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) throw new BadRequestError('密碼要是 4 位數字');
}

function newSession() {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, Date.now());
  return token;
}

function checkLockout(now = Date.now()) {
  if (now < lockedUntil) throw new TooManyAttemptsError(Math.ceil((lockedUntil - now) / 1000));
}

function matches(sec, pin) {
  const a = Buffer.from(hash(pin, sec.salt), 'hex');
  const b = Buffer.from(sec.pinHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function recordFailure(now = Date.now()) {
  failures += 1;
  log.warn('pin_wrong', { failures });
  if (failures >= MAX_FAILURES) {
    failures = 0;
    lockedUntil = now + LOCKOUT_MS;
    throw new TooManyAttemptsError(Math.ceil(LOCKOUT_MS / 1000));
  }
  throw new WrongPinError(MAX_FAILURES - failures);
}

export async function hasPin() {
  return !!(await readSecurity());
}

async function writePin(pin) {
  const salt = randomBytes(16).toString('hex');
  await writeJsonAtomic(SECURITY_PATH, { algo: 'scrypt', salt, pinHash: hash(pin, salt), updatedAt: toLocalIso(Date.now()) });
}

/** 第一次設定密碼（已經有密碼時不能用這個）。成功回傳 token。 */
export function setupPin(pin) {
  assertPinFormat(pin);
  return enqueue(SECURITY_PATH, async () => {
    if (await readSecurity()) throw new AppError('已經設定過密碼了', { status: 409, code: 'pin_exists' });
    await writePin(pin);
    log.info('pin_setup');
    return newSession();
  });
}

/** 輸入密碼解鎖。成功回傳 token；錯了丟 WrongPinError／TooManyAttemptsError。 */
export async function unlock(pin) {
  checkLockout();
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return recordFailure();
  const sec = await readSecurity();
  if (!sec) return newSession(); // 還沒設定密碼：不用鎖
  if (!matches(sec, pin)) return recordFailure();
  failures = 0;
  return newSession();
}

/**
 * 重要操作（刪除角色、匯入備份）前再確認一次密碼。不產生新的 session。
 * 錯了一樣算失敗次數、一樣會被暫時鎖住。還沒設定密碼時直接通過。
 */
export async function verifyPin(pin) {
  checkLockout();
  const sec = await readSecurity();
  if (!sec) return true;
  if (typeof pin !== 'string' || !PIN_RE.test(pin) || !matches(sec, pin)) return recordFailure();
  failures = 0;
  return true;
}

/** 改密碼：要先輸入目前的密碼。 */
export function changePin(current, next) {
  assertPinFormat(next);
  return enqueue(SECURITY_PATH, async () => {
    checkLockout();
    const sec = await readSecurity();
    if (sec && (typeof current !== 'string' || !matches(sec, current))) return recordFailure();
    failures = 0;
    await writePin(next);
    log.info('pin_changed');
    return true;
  });
}

/** token 還有效嗎？有效的話順便延長。 */
export function validateSession(token, now = Date.now()) {
  if (typeof token !== 'string' || !sessions.has(token)) return false;
  if (now - sessions.get(token) > SESSION_IDLE_MS) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, now);
  return true;
}

/** 上鎖（前端閒置 15 分鐘、或按鎖定）：這組 token 作廢。 */
export function endSession(token) {
  sessions.delete(token);
}

/** 給測試用 */
export function _resetLockState() {
  sessions.clear();
  failures = 0;
  lockedUntil = 0;
}
