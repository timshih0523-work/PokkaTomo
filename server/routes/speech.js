// routes/speech.js — 手機／平板的「按住說話」：錄音傳到 Mac 辨識（speechService.js）
//   POST /api/speech   body＝WAV（Content-Type: audio/wav，最多 8MB ≈ 4 分鐘）→ { text }
//     語言用目前角色說話的語言（中文 zh-TW、日文 ja-JP）。沒聽到聲音回 { text: '' }。
//     辨識還不能用：503 speech_unavailable（前端改成打字）。
import express, { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError, BadRequestError, NoCharacterError } from '../lib/errors.js';
import { currentCharacterId } from '../lib/characterContext.js';
import { getCharacter } from '../characterService.js';
import { transcribe, speechAvailable, looksLikeWav, SPEECH_LOCALES } from '../speechService.js';
import { log } from '../lib/logger.js';

const router = Router();

router.post(
  '/speech',
  express.raw({ type: () => true, limit: '8mb' }),
  asyncHandler(async (req, res) => {
    if (!speechAvailable()) throw new AppError('語音辨識還不能用', { status: 503, code: 'speech_unavailable' });
    if (!looksLikeWav(req.body)) throw new BadRequestError('不是 WAV 錄音');
    const ch = await getCharacter(currentCharacterId());
    if (!ch) throw new NoCharacterError();
    const started = Date.now();
    try {
      const { text, onDevice } = await transcribe(req.body, SPEECH_LOCALES[ch.language] || 'zh-TW');
      log.info('speech_recognized', { ms: Date.now() - started, chars: text.length, onDevice, bytes: req.body.length });
      res.json({ text });
    } catch (err) {
      log.warn('speech_failed', { code: err.code, error: String(err.message).slice(0, 300) });
      if (err.code === 'not_authorized') throw new AppError('語音辨識沒有被允許', { status: 503, code: 'speech_unavailable' });
      throw new AppError('辨識失敗了', { status: 500, code: 'speech_failed' });
    }
  })
);

export default router;
