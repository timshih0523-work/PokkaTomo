// routes/greet.js — POST /api/greet：PokkaTomo 主動打招呼（見 greetService.js）
// 回傳 { greeting, mood }；這個時段已經打過招呼、使用者正在聊天中、或 fm 不可用時回傳 { greeting: null }。
// 用 POST 是因為它可能會「產生並存下一句新的問候」，不是單純讀資料。
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { maybeGreet } from '../greetService.js';

const router = Router();

router.post(
  '/greet',
  asyncHandler(async (_req, res) => {
    const result = await maybeGreet();
    res.json(result || { greeting: null });
  })
);

export default router;
