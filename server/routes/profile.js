// routes/profile.js — GET/POST /api/profile
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getProfile, saveProfile } from '../profileService.js';

const router = Router();

router.get(
  '/profile',
  asyncHandler(async (_req, res) => {
    const profile = await getProfile();
    res.json(profile);
  })
);

router.post(
  '/profile',
  asyncHandler(async (req, res) => {
    // 說話的語言（language）建立角色時就決定了，之後不能從設定改（稱呼、個性、日記…都跟著它）。
    // 介面顯示的語言是另一個欄位 uiLanguage，可以隨時改。
    const { language: _ignored, ...partial } = req.body && typeof req.body === 'object' ? req.body : {};
    const next = await saveProfile(partial);
    res.json(next);
  })
);

export default router;
