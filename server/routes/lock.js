// routes/lock.js — 四位數密碼鎖（見 lockService.js）。這幾支不用先解鎖。
//   GET  /api/lock/status            { hasPin, unlocked }（unlocked：帶的 token 還有效嗎）
//   POST /api/lock/setup  { pin }    第一次設定 → { token }
//   POST /api/lock/unlock { pin }    → { token }；錯 401 wrong_pin { attemptsLeft }；太多次 429 { retryAfterSec }
//   POST /api/lock/change { current, next }  要帶有效 token → { ok }
//   POST /api/lock/lock              作廢目前的 token → { ok }
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { hasPin, setupPin, unlock, changePin, validateSession, endSession, WrongPinError, TooManyAttemptsError } from '../lockService.js';

const router = Router();
const tokenOf = (req) => req.get('x-pokkatomo-token');

// 密碼錯誤的回應多帶剩幾次／要等幾秒
function sendLockError(res, err) {
  if (err instanceof WrongPinError) return res.status(401).json({ error: err.code, message: err.message, attemptsLeft: err.attemptsLeft });
  if (err instanceof TooManyAttemptsError) return res.status(429).json({ error: err.code, message: err.message, retryAfterSec: err.retryAfterSec });
  throw err;
}

router.get(
  '/lock/status',
  asyncHandler(async (req, res) => {
    res.json({ hasPin: await hasPin(), unlocked: validateSession(tokenOf(req)) });
  })
);

router.post(
  '/lock/setup',
  asyncHandler(async (req, res) => {
    res.json({ token: await setupPin(req.body?.pin) });
  })
);

router.post(
  '/lock/unlock',
  asyncHandler(async (req, res) => {
    try {
      res.json({ token: await unlock(req.body?.pin) });
    } catch (err) {
      sendLockError(res, err);
    }
  })
);

router.post(
  '/lock/change',
  asyncHandler(async (req, res) => {
    if ((await hasPin()) && !validateSession(tokenOf(req))) {
      return res.status(401).json({ error: 'locked', message: '請先輸入密碼' });
    }
    try {
      await changePin(req.body?.current, req.body?.next);
      res.json({ ok: true });
    } catch (err) {
      sendLockError(res, err);
    }
  })
);

router.post('/lock/lock', (req, res) => {
  endSession(tokenOf(req));
  res.json({ ok: true });
});

export default router;
