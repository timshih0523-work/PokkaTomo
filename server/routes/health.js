// routes/health.js — GET /api/health
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getFmStatus } from '../fmService.js';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const fm = await getFmStatus();
    res.json({ ok: true, fm });
  })
);

export default router;
