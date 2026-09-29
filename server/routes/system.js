// routes/system.js — 跟聊天無關的系統功能
//   GET  /api/config  前端需要的設定（字數上限只在 config.js 定義一次，前端從這裡拿）   ← 不用密碼
//   POST /api/log     前端的錯誤回報，寫進紀錄檔（見 lib/logger.js）                    ← 不用密碼
//   GET  /api/export  下載 zip：所有資料＋給人看的對話紀錄／日記（見 exportService.js）  ← 要密碼（exportRouter）
//   POST /api/import  上傳匯出的 zip 還原（標頭 X-PokkaTomo-Pin 再確認一次密碼；見 dataAdminService.js）← 要密碼

import express, { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { BadRequestError } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { buildExport } from '../exportService.js';
import { importBackup } from '../dataAdminService.js';
import { verifyPin } from '../lockService.js';
import { LIMITS } from '../config.js';

const router = Router();

router.get('/config', (_req, res) => {
  res.json({ limits: LIMITS });
});

// 前端只能回報固定幾種等級，欄位都截斷；一分鐘最多 30 筆，避免某個錯誤在迴圈裡洗版紀錄檔。
const CLIENT_LEVELS = new Set(['error', 'warn', 'info']);
let windowStart = 0;
let windowCount = 0;

router.post('/log', (req, res) => {
  const { level = 'error', event, detail } = req.body || {};
  if (typeof event !== 'string' || !event.trim()) throw new BadRequestError('缺少 event');
  const now = Date.now();
  if (now - windowStart > 60000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  if (windowCount <= 30) {
    const lv = CLIENT_LEVELS.has(level) ? level : 'error';
    log[lv](`client_${event.trim().slice(0, 40)}`, {
      detail: typeof detail === 'string' ? detail.slice(0, 300) : undefined,
      ua: String(req.get('user-agent') || '').slice(0, 120)
    });
  }
  res.json({ ok: true });
});

export default router;

// 匯出要先輸入密碼，所以分開一個 router，掛在 requireUnlock 後面（見 routes/index.js）
export const exportRouter = Router();
exportRouter.get(
  '/export',
  asyncHandler(async (_req, res) => {
    const { filename, buffer } = await buildExport();
    res.set({
      'Content-Type': 'application/zip',
      // filename* 讓瀏覽器正確處理非 ASCII；檔名本身其實是 ASCII
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store'
    });
    res.send(buffer);
  })
);

// 匯入備份：body 是 zip 本身（不是 JSON）。一般的 express.json 上限 1MB，這裡另外放寬。
exportRouter.post(
  '/import',
  express.raw({ type: () => true, limit: '300mb' }),
  asyncHandler(async (req, res) => {
    await verifyPin(req.get('x-pokkatomo-pin'));
    const result = await importBackup(req.body);
    res.json({ ok: true, ...result });
  })
);
