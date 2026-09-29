// routes/index.js — 把各資源的路由組成一個 Router，server.js 只要 app.use('/api', apiRouter)。
// 之後要加新的 API（例如未來的多人身分切換），在這裡新增一個檔案 + 一行 router.use() 就好，
// 不用回去動 server.js。
import { Router } from 'express';

import healthRoutes from './health.js';
import profileRoutes from './profile.js';
import historyRoutes from './history.js';
import chatRoutes from './chat.js';
import diaryRoutes from './diary.js';
import greetRoutes from './greet.js';
import weatherRoutes from './weather.js';
import companionRoutes from './companion.js';
import systemRoutes, { exportRouter } from './system.js';
import characterRoutes from './characters.js';
import lockRoutes from './lock.js';
import memoryRoutes from './memory.js';
import speechRoutes from './speech.js';
import { requireUnlock } from '../lib/lockGuard.js';
import { withCharacter, isValidCharacterId } from '../lib/characterContext.js';
import { listCharacters } from '../characterService.js';
import { NoCharacterError } from '../lib/errors.js';

const router = Router();

// 不用密碼就能用的：健康檢查、設定值（字數上限）、密碼鎖本身、前端錯誤回報
router.use(healthRoutes);
router.use(lockRoutes);
router.use(systemRoutes);

// 其他全部要先輸入密碼（還沒設定密碼時不擋，見 lib/lockGuard.js）
router.use(requireUnlock);

// 這個請求是跟哪個角色互動（X-PokkaTomo-Character 標頭；沒給或不存在 = 清單裡第一個角色）。
// 之後這個請求裡所有的讀寫都會用那個角色的資料（見 lib/characterContext.js）。
// 一個角色都沒有（全新安裝）時不自動建立：只有角色清單／新增、匯出匯入、手機連線可以用，其他回 409 no_character。
router.use(async (req, _res, next) => {
  try {
    const raw = req.get('x-pokkatomo-character');
    const list = await listCharacters();
    if (!list.length) {
      req.noCharacter = true;
      return next();
    }
    const id = isValidCharacterId(raw) && list.some((c) => c.id === raw) ? raw : list[0].id;
    withCharacter(id, () => next());
  } catch (err) {
    next(err);
  }
});

// 不需要「目前角色」的
router.use(characterRoutes);
router.use(exportRouter);

router.use((req, _res, next) => {
  if (req.noCharacter) return next(new NoCharacterError());
  next();
});

router.use(profileRoutes);
router.use(historyRoutes);
router.use(chatRoutes);
router.use(diaryRoutes);
router.use(greetRoutes);
router.use(weatherRoutes);
router.use(companionRoutes);
router.use(memoryRoutes);
router.use(speechRoutes);

export default router;
