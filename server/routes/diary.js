// routes/diary.js — PokkaTomo 的日記（見 diaryService.js）
//   GET  /api/diary        全部日記（新的在前）+ 認識第幾天；順便在背景補寫還沒寫的過去日記
//   POST /api/diary/today  請 PokkaTomo 現在寫（或重寫）今天的日記
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { FmUnavailableError, FmRespondError } from '../lib/errors.js';
import { getDiaries, writeTodayDiary, backfillPastDiaries } from '../diaryService.js';
import { getProfile } from '../profileService.js';
import { getFmStatus } from '../fmService.js';
import { log } from '../lib/logger.js';

const router = Router();

router.get(
  '/diary',
  asyncHandler(async (_req, res) => {
    backfillPastDiaries().catch((err) => log.warn('diary_backfill_failed', { error: err.message }));
    const [entries, profile] = await Promise.all([getDiaries(), getProfile()]);
    res.json({ entries, firstMetAt: profile.firstMetAt || null });
  })
);

router.post(
  '/diary/today',
  asyncHandler(async (_req, res) => {
    const fmStatus = await getFmStatus();
    if (!fmStatus.available) {
      throw new FmUnavailableError(`PokkaTomo 現在沒辦法寫日記：${fmStatus.error}`);
    }
    let entry;
    try {
      entry = await writeTodayDiary();
    } catch (err) {
      throw new FmRespondError(err.message);
    }
    // entry 是 null = 今天還沒聊過天，沒東西可以寫（前端會顯示「今天還沒聊天喔」）
    res.json({ entry });
  })
);

export default router;
