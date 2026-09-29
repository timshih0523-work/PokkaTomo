// greetService.js
// 主動問候：PokkaTomo 不是只會「被問才答」，早上、下午、晚上、深夜打開的時候，牠會先開口。
//
// 真的 ポケとも 會「早午晚送上問候」，這是它跟一般聊天機器人最不一樣的地方——
// 感覺是牠在過牠的日子、看到你回來了。以前這個專案只有「完全沒聊過天時的固定招呼語」，
// 之後每次打開都是一片安靜，等使用者先講話。
//
// 規則（都在伺服器這邊決定，多開幾個分頁也不會重複打招呼）：
//   - 一天分四個時段（lib/time.js 的 timeSlot），每個時段最多主動講一次。
//   - 使用者 GREET_QUIET_AFTER_CHAT_MIN 分鐘內才剛講過話 → 正在聊天中，不插話。
//   - 問候由 fm 產生：知道現在幾點、最近的日記（前幾天聊過什麼）、使用者的喜好／紀念日，
//     所以可以說出「昨天說的報告交出去了嗎？」這種有記憶的招呼，而不是每次都一樣的罐頭句。
//   - 產生的問候會存進對話紀錄（proactive 欄位記時段），使用者接著回話時 AI 知道自己剛說了什麼。
//   - fm 不可用或失敗 → 回傳 null，前端會用本機的固定招呼語頂替（只在完全沒聊天紀錄時）。
//   - 角色在睡覺（使用者說過晚安，還沒到早上）→ 不打招呼，牠在睡。
//   - 好幾天沒來（MISSED_YOU_AFTER_DAYS 天以上）→ 先說想你了（參考 LOVOT：越久沒見越黏人），
//     回傳 missedDays 讓前端也做個表情。
//   - 說過「我出門了」→ 回來打開畫面時先說歡迎回來（出去了幾小時）。

import { getFmStatus, buildSystemPrompt, fmRespond } from './fmService.js';
import { getProfile } from './profileService.js';
import { getAllHistory, appendMessages } from './historyService.js';
import { getRecentMemories } from './diaryService.js';
import { getWeatherForPrompt } from './weatherService.js';
import { getState, isAsleep, awayHours, consumeAway, relationshipPromptLine } from './companionService.js';
import { eventsOn, eventsPromptLine } from './lib/seasons.js';
import { parseMoodTag } from './lib/mood.js';
import { timeSlot } from './lib/time.js';
import { GREET_QUIET_AFTER_CHAT_MIN, HISTORY_CONTEXT_LIMIT, MISSED_YOU_AFTER_DAYS } from './config.js';
import { log } from './lib/logger.js';
import { currentCharacterId } from './lib/characterContext.js';

const SLOT_HINT = {
  morning: '現在是早上',
  afternoon: '現在是下午',
  evening: '現在是晚上',
  night: '現在已經是深夜了'
};

const inFlight = new Map();

/**
 * @returns {Promise<{ greeting: string, mood: string } | null>}
 */
export function maybeGreet(now = new Date()) {
  const { slot, dayKey } = timeSlot(now);
  const key = `${dayKey}:${slot}`;
  const flightKey = `${currentCharacterId()}:${key}`;
  // 兩個分頁幾乎同時打開：共用同一個產生中的結果，不會各自產生一句、講兩次。
  if (inFlight.has(flightKey)) return inFlight.get(flightKey);

  const job = (async () => {
    const history = await getAllHistory();
    if (history.some((h) => h?.proactive === key)) return null;

    const lastUserTs = [...history].reverse().find((h) => h?.role === 'user')?.ts;
    if (lastUserTs && now.getTime() - lastUserTs < GREET_QUIET_AFTER_CHAT_MIN * 60 * 1000) return null;

    const companion = await getState();
    if (isAsleep(companion, now.getTime())) return null;

    const fmStatus = await getFmStatus();
    if (!fmStatus.available) return null;

    const [profile, memories, weather] = await Promise.all([getProfile(), getRecentMemories(now), getWeatherForPrompt()]);
    const instructions = buildSystemPrompt({
      profile,
      memories,
      weather,
      now,
      extras: [eventsPromptLine(eventsOn(now)), relationshipPromptLine(companion, profile.firstMetAt, now)]
    });
    const isFirstEver = !history.some((h) => h?.role === 'user');
    const missedDays = lastUserTs ? Math.floor((now.getTime() - lastUserTs) / 86400000) : 0;
    // 先只「看」出門多久了；問候真的產生成功之後才清掉（見下面 consumeAway），
    // 不然模型剛好失敗的話，這次「歡迎回來」就永遠不會說了。
    const awayH = awayHours(companion, now.getTime());

    let situation;
    if (isFirstEver) {
      situation = '這是你們第一次見面：簡單自我介紹，告訴對方可以按住麥克風跟你說話、或用鍵盤打字。';
    } else if (missedDays >= MISSED_YOU_AFTER_DAYS) {
      situation = `你們已經 ${missedDays} 天沒有聊天了，你很想念對方。先撒嬌地說想你了（不要責怪對方），再打招呼，天數越多越想念。一到兩句。`;
    } else if (awayH != null) {
      situation = `對方大約 ${awayH} 小時前說要出門，現在回來了。很開心地說歡迎回來，問問今天過得怎麼樣。一到兩句。`;
    } else {
      situation =
        '用一到兩句話自然地打招呼，可以關心對方、提起最近日記裡聊過的事的後續、或（早上的話）順口提一下今天的天氣，不要每次都說一樣的話，不要問太多問題。';
    }
    const message = [
      '（這不是使用者說的話。使用者剛打開畫面，還沒開口，現在由你主動先打招呼。）',
      `${SLOT_HINT[slot]}。`,
      situation
    ].join('\n');

    let raw;
    try {
      raw = await fmRespond({ purpose: 'greet', message, instructions, history: history.slice(-HISTORY_CONTEXT_LIMIT) });
    } catch (err) {
      log.warn('greet_failed', { error: err.message });
      return null;
    }
    const { text, mood } = parseMoodTag(raw);
    if (!text) return null;

    await appendMessages([{ role: 'assistant', content: text, mood, ts: now.getTime(), proactive: key }]);
    if (awayH != null) await consumeAway(now.getTime());
    return {
      greeting: text,
      mood,
      missedDays: missedDays >= MISSED_YOU_AFTER_DAYS ? missedDays : 0,
      welcomeBack: awayH != null
    };
  })().finally(() => inFlight.delete(flightKey));

  inFlight.set(flightKey, job);
  return job;
}
