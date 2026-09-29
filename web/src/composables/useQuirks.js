// useQuirks.js
// 角色「自己的小生活」：沒人理牠的時候偶爾打個噴嚏、打呵欠、哼歌；睡著的時候說夢話；
// 被連戳好幾下會頭暈；睡著時被戳會迷迷糊糊地嘟囔，戳到第三下才醒。
//
// 靈感是 Panasonic 的 NICOBO（「弱いロボット」）：會說夢話、會放屁、不完美，
// 反而讓人想照顧它。這些小動作只是畫面上的泡泡跟動畫，不會呼叫 AI、不會寫進聊天紀錄。
//
// 刻意很節制：閒置小動作 3～6 分鐘才一次、分頁在背景或有面板打開時不做、正在聊天時不做，
// 避免變成一直在旁邊吵的角色。

import { ref, onUnmounted, getCurrentInstance } from 'vue';

const IDLE_MIN_MS = 3 * 60 * 1000;
const IDLE_MAX_MS = 6 * 60 * 1000;
const SLEEP_TALK_MIN_MS = 35 * 1000;
const SLEEP_TALK_MAX_MS = 80 * 1000;
const QUIRK_DURATION_MS = 1600;
// 比較長的動作：吃東西（咬幾口）、跳舞
const LONG_QUIRKS = { eat: 3600, dance: 3600 };

// 聊到吃的／音樂跳舞 → 講完話之後吃一口點心／跳一段舞（App.vue 的 afterSpeaking）
const FOOD_RE = /吃|餓|飯|點心|零食|宵夜|早餐|午餐|晚餐|甜點|蛋糕|好吃|食べ|ごはん|ご飯|お腹|おなか|おやつ|おいし|美味|ランチ|ケーキ|スイーツ/;
const DANCE_RE = /跳舞|音樂|唱歌|演唱會|歌|ダンス|踊|音楽|歌う|ライブ|カラオケ/;
export function reactionQuirkFor(text) {
  const s = String(text || '');
  if (DANCE_RE.test(s)) return 'dance';
  if (FOOD_RE.test(s)) return 'eat';
  return null;
}

// 吃飯時間（早餐、午餐、下午茶、晚餐）閒置時比較常偷吃點心
function isSnackTime(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  return (m >= 420 && m < 540) || (m >= 690 && m < 810) || (m >= 900 && m < 960) || (m >= 1080 && m < 1200);
}

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * @param {object} o
 * @param {import('vue').Ref<string>} o.status     角色狀態（IDLE / ASLEEP …）
 * @param {() => object} o.strings                目前語言的字典（t.value）
 * @param {() => number} o.level                  目前親密度等級
 * @param {() => {nickname?: string, preferences?: string[]}} o.profile
 * @param {() => boolean} o.canAct                現在適合做小動作嗎（沒有面板打開、沒在傳訊息…）
 * @param {(text: string) => void} o.showBubble   跳出反應泡泡
 * @param {() => void} o.onWake                   睡著時被戳醒
 */
export function useQuirks({ status, strings, level, profile, canAct, showBubble, onWake }) {
  const quirk = ref(null);
  let quirkTimer = null;
  let idleTimer = null;
  let sleepTimer = null;

  function playQuirk(name, { line = true } = {}) {
    quirk.value = name;
    clearTimeout(quirkTimer);
    quirkTimer = setTimeout(() => (quirk.value = null), LONG_QUIRKS[name] || QUIRK_DURATION_MS);
    const lines = strings().quirkLines?.[name];
    if (line && lines?.length) showBubble(pick(lines));
  }

  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

  // ---- 閒置時的小動作 ----
  function idlePool() {
    const pool = ['yawn', 'hum', 'hum', 'sneeze', 'hiccup', 'lookaround', 'lookaround'];
    // 噗（放屁）只有熟起來之後才會在你面前不小心發生 😳
    if (level() >= 3) pool.push('toot');
    // 吃點心：吃飯時間很常，其他時間偶爾；跳舞：熟一點（Lv2）之後偶爾自己跳
    pool.push(...(isSnackTime() ? ['eat', 'eat', 'eat'] : ['eat']));
    if (level() >= 2) pool.push('dance');
    return pool;
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (visible() && canAct() && status.value === 'IDLE') playQuirk(pick(idlePool()));
      scheduleIdle();
    }, rand(IDLE_MIN_MS, IDLE_MAX_MS));
  }

  // ---- 說夢話 ----
  function sleepTalkLine() {
    const { nickname = '', preferences = [] } = profile() || {};
    const lines = (strings().sleepTalk || []).filter(
      (l) => (!l.includes('{pref}') || preferences.length) && (!l.includes('{nick}') || (nickname && level() >= 4))
    );
    if (!lines.length) return 'Zzz…';
    return pick(lines).replace('{pref}', pick(preferences.length ? preferences : [''])).replace('{nick}', nickname);
  }

  function scheduleSleepTalk() {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      if (visible() && canAct() && status.value === 'ASLEEP') showBubble(sleepTalkLine());
      scheduleSleepTalk();
    }, rand(SLEEP_TALK_MIN_MS, SLEEP_TALK_MAX_MS));
  }

  // ---- 點角色 ----
  let taps = [];
  let sleepTaps = [];

  /**
   * 點角色時先問這裡要不要接手。回傳 true 代表已經處理掉了（頭暈、睡著時被戳），
   * App.vue 就不用再跳一般的反應。
   */
  function handleTap() {
    const now = Date.now();
    if (status.value === 'ASLEEP') {
      sleepTaps = sleepTaps.filter((t) => now - t < 4000).concat(now);
      if (sleepTaps.length >= 3) {
        sleepTaps = [];
        onWake();
        showBubble(strings().wakeUp);
      } else {
        showBubble(pick(strings().sleepMumble || ['…']));
      }
      return true;
    }
    taps = taps.filter((t) => now - t < 3000).concat(now);
    if (taps.length >= 5) {
      taps = [];
      playQuirk('dizzy');
      return true;
    }
    return false;
  }

  function start() {
    scheduleIdle();
    scheduleSleepTalk();
  }

  function stop() {
    clearTimeout(quirkTimer);
    clearTimeout(idleTimer);
    clearTimeout(sleepTimer);
  }
  // 在元件裡用的時候，元件卸載就自動停；在測試（沒有元件）裡用的時候，自己呼叫 stop()。
  if (getCurrentInstance()) onUnmounted(stop);

  return { quirk, playQuirk, handleTap, start, stop, sleepTalkLine };
}
