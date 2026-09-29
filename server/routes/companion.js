// routes/companion.js — 角色自己的生活狀態（見 companionService.js、fortuneService.js）
//   GET  /api/companion        → { growth, asleep, events, fortuneToday }
//                                 growth：{ level, points, currentMin, nextMin, progress, streakDays }
//                                 events：今天的節日 [{ id }]（前端依 id 換裝飾、顯示名字）
//   POST /api/companion/pat    body { part }：摸角色（part 見 companionService 的 TOUCH_PARTS）→ { growth, levelUp }
//   POST /api/companion/wake   → 把睡著的角色叫醒
//   POST /api/fortune          → 今日占卜 { fortune, fresh }（fresh=false 表示今天已經抽過，這是同一個結果）
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getState, levelInfo, isAsleep, recordPat, wakeUp } from '../companionService.js';
import { getTodayFortune } from '../fortuneService.js';
import { eventsOn } from '../lib/seasons.js';
import { localDateKey } from '../lib/time.js';

const router = Router();

router.get(
  '/companion',
  asyncHandler(async (_req, res) => {
    const state = await getState();
    const now = new Date();
    res.json({
      growth: { ...levelInfo(state.points), streakDays: state.streak.days },
      asleep: isAsleep(state, now.getTime()),
      events: eventsOn(now).map((e) => ({ id: e.id })),
      fortuneToday: state.fortune?.date === localDateKey(now)
    });
  })
);

router.post(
  '/companion/pat',
  asyncHandler(async (req, res) => {
    res.json(await recordPat(Date.now(), req.body?.part));
  })
);

router.post(
  '/companion/wake',
  asyncHandler(async (_req, res) => {
    await wakeUp();
    res.json({ ok: true });
  })
);

router.post(
  '/fortune',
  asyncHandler(async (_req, res) => {
    res.json(await getTodayFortune());
  })
);

export default router;
