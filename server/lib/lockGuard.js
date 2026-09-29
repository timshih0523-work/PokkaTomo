// lockGuard.js — 還沒輸入密碼的請求擋下來（401 locked）。
// 還沒設定過密碼時不擋（第一次打開會先請她設定，見前端 LockScreen.vue）。
import { hasPin, validateSession } from '../lockService.js';

export async function requireUnlock(req, res, next) {
  try {
    if (validateSession(req.get('x-pokkatomo-token'))) return next();
    if (!(await hasPin())) return next();
    res.status(401).json({ error: 'locked', message: '請先輸入密碼' });
  } catch (err) {
    next(err);
  }
}
