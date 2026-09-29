// routes/history.js
//   GET /api/history?limit=N          最近 N 則（從對話檔讀，最多 600）
//   GET /api/history/day?date=YYYY-MM-DD  某一天的全部對話；不給 date = 今天
//     網頁一打開不再顯示舊對話，按「今天的對話」按鈕才用這支讀出來。
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { BadRequestError } from '../lib/errors.js';
import { getRecentHistory } from '../historyService.js';
import { readArchiveDay } from '../archiveService.js';
import { localDateKey } from '../lib/time.js';
import { HISTORY_MAX_STORED_MESSAGES } from '../config.js';

const router = Router();

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    // 限制在 1～600 的整數：以前負數會讓 slice(-limit) 變成 slice(正數)，回傳錯的那一段；
    // 最多 600（HISTORY_MAX_STORED_MESSAGES），再多用日期查。
    const requested = Math.floor(Number(req.query.limit));
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, HISTORY_MAX_STORED_MESSAGES) : 20;
    const history = await getRecentHistory(limit);
    res.json(history);
  })
);

router.get(
  '/history/day',
  asyncHandler(async (req, res) => {
    const date = req.query.date === undefined ? localDateKey(new Date()) : String(req.query.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestError('日期格式要是 YYYY-MM-DD');
    const messages = (await readArchiveDay(date)).map(({ role, content, ts, mood, kind, proactive, fortune }) => ({
      role,
      content,
      ts,
      mood,
      kind,
      proactive,
      fortune
    }));
    res.json({ date, messages });
  })
);

export default router;
