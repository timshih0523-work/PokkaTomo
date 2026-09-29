// routes/chat.js — POST /api/chat
// 這裡只負責「一輪對話的流程」：檢查訊息、確認 fm 可用、組 prompt、呼叫 fm、
// 存歷史、觸發背景記憶提取。錯誤一律用 throw，交給 asyncHandler + 集中錯誤處理
// middleware（見 server.js）統一轉成 JSON 回應，這個檔案不用自己寫 try/catch。

import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { BadRequestError, FmUnavailableError, FmRespondError } from '../lib/errors.js';
import { getFmStatus, buildSystemPrompt, fmRespond, isContextOverflowError } from '../fmService.js';
import { getProfile, saveProfile } from '../profileService.js';
import { getRecentHistory, appendMessages, extractFacts } from '../historyService.js';
import { backfillPastDiaries } from '../diaryService.js';
import { getWeatherForPrompt } from '../weatherService.js';
import { recall } from '../ragService.js';
import { runDailyBackup } from '../backupService.js';
import { getState, recordChat, awayHours, relationshipPromptLine } from '../companionService.js';
import { fortunePromptLine } from '../fortuneService.js';
import { detectRitual, ritualPromptLine } from '../lib/rituals.js';
import { eventsOn, eventsPromptLine } from '../lib/seasons.js';
import { parseMoodTag } from '../lib/mood.js';
import { localDateKey } from '../lib/time.js';
import {
  HISTORY_CONTEXT_LIMIT,
  HISTORY_FM_CONTEXT_TURNS,
  DISABLE_FACT_EXTRACTION,
  MESSAGE_MAX_LEN,
  RAG_MIN_MESSAGE_LEN
} from '../config.js';
import { log } from '../lib/logger.js';

const router = Router();

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const rawMessage = req.body?.message;
    // 先檢查型別再 trim：如果呼叫端傳的不是字串（例如數字、物件），直接 .trim() 會丟例外，
    // 雖然 asyncHandler 接得住不會讓請求掛住，但那樣會變成一個籠統的 500，
    // 這裡直接判斷清楚，回一個看得懂的 400「訊息格式不對」。
    if (rawMessage !== undefined && typeof rawMessage !== 'string') {
      throw new BadRequestError('訊息格式不對，應該是文字');
    }
    const message = (rawMessage || '').trim();
    if (!message) {
      throw new BadRequestError('訊息不能是空的');
    }
    // express.json() 只擋整個 request body 超過 1MB，對單一欄位沒有合理上限——
    // 沒有這個檢查的話，一大段文字會整段被塞進 fm 的 prompt，浪費資源、拖慢回應，
    // 甚至可能讓 fm 逾時。用 BadRequestError 讓使用者馬上知道，而不是等到逾時。
    if (message.length > MESSAGE_MAX_LEN) {
      throw new BadRequestError(`訊息太長了，最多 ${MESSAGE_MAX_LEN} 個字`);
    }

    // 每次送訊息都先問一次 getFmStatus()：已經確認可用的話直接用快取（不會多 spawn 一次），
    // 如果目前記錄不可用，getFmStatus() 內部會重新真的檢查一次——
    // 使用者可能就是剛打開 Apple Intelligence，這裡再給一次機會。
    const fmStatus = await getFmStatus();
    if (!fmStatus.available) {
      throw new FmUnavailableError(`PokkaTomo 現在沒辦法回話：${fmStatus.error}`);
    }

    const [profile, history, weather, companion] = await Promise.all([
      getProfile(),
      getRecentHistory(HISTORY_CONTEXT_LIMIT),
      getWeatherForPrompt(),
      getState()
    ]);
    // 生活儀式（早安／出門／回家／晚安，見 lib/rituals.js）＋節日＋親密度說話風格＋今天的占卜
    const ritual = detectRitual(message);
    // 長期記憶（RAG）：從很久以前的對話／日記找相關的事。已經在短期上下文（最近 8 則）、
    // 中期記憶（最近 3 篇日記）裡的不用重複；很短的話、生活儀式不搜（沒有內容可以對）。
    // 檢索失敗不影響聊天。
    let recalls = [];
    if (!ritual && message.length >= RAG_MIN_MESSAGE_LEN) {
      const inContext = history.slice(-HISTORY_FM_CONTEXT_TURNS);
      recalls = await recall(message, {
        excludeIds: inContext.filter((m) => m.role === 'user' && m.id).map((m) => m.id),
        excludeDates: [localDateKey(new Date())]
      }).catch((err) => {
        log.warn('rag_failed', { error: err.message });
        return [];
      });
    }
    const extras = [
      eventsPromptLine(eventsOn(new Date())),
      relationshipPromptLine(companion, profile.firstMetAt),
      fortunePromptLine(companion, message),
      ritualPromptLine(ritual, { awayHours: ritual === 'home' ? awayHours(companion) : null })
    ];
    // 中期記憶（最近幾篇日記）不再每句都附上：日記也一起進 RAG 檢索，跟這句話有關才會被想起來。
    const instructions = buildSystemPrompt({ profile, message, recalls, weather, extras });

    let raw;
    try {
      raw = await fmRespond({ message, instructions, history });
    } catch (err) {
      if (!isContextOverflowError(err)) throw new FmRespondError(err.message);
      // 內容太長塞不進模型：不帶歷史、日記、其他情境，只留人設＋這一輪的儀式提示，精簡版重試一次。
      log.warn('chat_context_overflow_retry', { error: err.message });
      try {
        raw = await fmRespond({
          message,
          instructions: buildSystemPrompt({ profile, extras: [ritualPromptLine(ritual)] }),
          history: []
        });
      } catch (retryErr) {
        throw new FmRespondError(retryErr.message);
      }
    }
    // 拿掉開頭的 [mood:xxx] 情緒標籤（見 lib/mood.js），情緒另外回傳給前端驅動角色的燈光跟表情。
    const { text: reply, mood } = parseMoodTag(raw);
    // fm 偶爾可能回傳空字串（例如被內容安全機制擋下但沒有丟例外）。
    // 如果放行，前端會顯示一個完全空白的對話泡泡，使用者只會覺得「怎麼都不講話」，
    // 卻看不到任何錯誤提示或重新傳送按鈕——跟這個專案一路以來「AI 沒反應時要讓
    // 使用者清楚知道發生什麼事」的設計方向矛盾。這裡當成錯誤處理，讓前端既有的
    // 錯誤泡泡 + 重新傳送機制接手，而不是靜默顯示一句空話。
    if (!reply) {
      throw new FmRespondError('PokkaTomo 這次沒有回應內容');
    }

    const now = Date.now();
    await appendMessages([
      { role: 'user', content: message, ts: now },
      { role: 'assistant', content: reply, mood, ts: now }
    ]);

    // 親密度 +1（每天有上限）、處理晚安（去睡覺）／出門／回家。升級的話前端會慶祝一下。
    const { growth, levelUp } = await recordChat({ ritual, now });

    // 記住「第一次聊天的那天」，日記面板會顯示「認識第 N 天」。只寫一次。
    if (!profile.firstMetAt) {
      saveProfile({ firstMetAt: localDateKey(new Date(now)) }).catch((err) =>
        log.warn('first_met_save_failed', { error: err.message })
      );
    }

    // 「關鍵記憶提取」：另外呼叫一次 fm 找喜好/紀念日，寫回 user.json。
    // 故意不 await——這需要多等一次 fm 的時間（可能好幾秒），不應該讓使用者等它，
    // 先把這輪的回覆送出去，記憶提取在背景默默做，做不做得到都不影響對話。
    // 很短的話（「嗯嗯」「好啊」）跟生活儀式（早安、晚安…）不可能有要記住的喜好或紀念日，
    // 就不要在背景多跑一次模型——在 Mac 上每次推論都要花幾秒的電跟資源。
    const worthExtracting = !ritual && message.length >= 6;
    if (!DISABLE_FACT_EXTRACTION && worthExtracting) {
      // 只把使用者說的話拿去擷取（角色說的話不是她的喜好，見 historyService.extractFacts）
      extractFacts([{ role: 'user', content: message }]).catch((err) => log.warn('extract_facts_unexpected', { error: err.message }));
    }

    // 跨過午夜、或好幾天沒開之後的第一句話：順便在背景把前幾天的日記補寫起來。
    backfillPastDiaries().catch((err) => log.warn('diary_backfill_failed', { error: err.message }));

    // 今天第一次用到的話，順便做一次自動備份（見 backupService.js；一天只做一次、不等它）。
    runDailyBackup();

    res.json({ reply, mood, ritual, growth, levelUp });
  })
);

export default router;
