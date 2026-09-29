// routes/weather.js — 天氣（見 weatherService.js）
//   GET /api/weather            → { weather, location }；沒設定地點或暫時抓不到天氣時 weather 是 null
//   PUT /api/weather/location   body { query }：地名查經緯度、存進 profile.location
//                               → { location }；找不到回傳 { location: null, notFound: true }；
//                                 query 空字串 = 清除地點（不顯示天氣）
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError, BadRequestError } from '../lib/errors.js';
import { getProfile, saveProfile } from '../profileService.js';
import { getWeather, geocode } from '../weatherService.js';
import { LIMITS } from '../config.js';

const router = Router();

router.get(
  '/weather',
  asyncHandler(async (_req, res) => {
    const [profile, weather] = await Promise.all([getProfile(), getWeather({ maxWaitMs: 6000 }).catch(() => null)]);
    res.json({ weather, location: profile.location || null });
  })
);

router.put(
  '/weather/location',
  asyncHandler(async (req, res) => {
    const query = req.body?.query;
    if (query !== undefined && typeof query !== 'string') throw new BadRequestError('地點格式不對');
    const q = (query || '').trim().slice(0, LIMITS.city);
    if (!q) {
      await saveProfile({ location: null });
      return res.json({ location: null });
    }

    const profile = await getProfile();
    let location;
    try {
      location = await geocode(q, profile.language);
    } catch (err) {
      throw new AppError(`查詢地點失敗：${err.message}`, { status: 503, code: 'weather_unavailable' });
    }
    if (!location) return res.json({ location: null, notFound: true });

    await saveProfile({ location });
    res.json({ location });
  })
);

export default router;
