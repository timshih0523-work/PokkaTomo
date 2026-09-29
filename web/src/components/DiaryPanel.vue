<!--
  DiaryPanel.vue — 日記本（月曆版）。

  日記是角色用自己的口吻寫的「今天跟你聊了什麼」（後端 server/diaryService.js），
  過去的日子會在背景自動補寫；今天的可以按按鈕請牠現在寫（或重寫）。

  用月曆呈現，才方便「回去看某一天」：
    - 有日記的日子，格子會染上牠那天的心情顏色（跟角色胸口的心情燈同一套顏色，見 moods.js）
    - ♥ = 紀念日（設定面板裡的紀念日，每年同一天都會標）
    - ⭐ = 第一次聊天的那天（profile.firstMetAt）
    - 點任何一天，下面顯示那天的日記；‹ › 換月份，「回到今天」跳回來
  標題下面顯示「認識第 N 天」（第一次聊天那天算第 1 天）。
-->
<template>
  <BaseDialog :open="open" :title="strings.title" :close-label="strings.close" @close="$emit('close')">
    <p v-if="daysTogether" class="days-together">{{ strings.daysTogether(daysTogether) }}</p>

    <!-- 親密度（server/companionService.js）：等級、進度條、連續見面天數 -->
    <section v-if="growth" class="growth" :aria-label="growthStrings.label(growth.level, levelTitle)">
      <div class="growth-head">
        <strong>{{ growthStrings.label(growth.level, levelTitle) }}</strong>
        <span v-if="growth.streakDays > 1" class="streak">🔥 {{ growthStrings.streak(growth.streakDays) }}</span>
      </div>
      <div
        class="growth-bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(growth.progress * 100)"
      >
        <span :style="{ width: Math.round(growth.progress * 100) + '%' }"></span>
      </div>
      <p class="growth-next">
        {{ growth.nextMin == null ? growthStrings.max : growthStrings.next(growth.nextMin - growth.points) }}
      </p>
    </section>

    <div class="write-row">
      <button ref="writeBtnEl" type="button" class="write-btn" :disabled="writing" @click="writeToday">
        {{ writing ? strings.writing : hasToday ? strings.rewriteToday : strings.writeToday }}
      </button>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    </div>

    <div class="month-nav">
      <button type="button" class="nav-btn" :aria-label="strings.prevMonth" :title="strings.prevMonth" @click="shiftMonth(-1)">‹</button>
      <h3 class="month-title" aria-live="polite">{{ monthTitle }}</h3>
      <button type="button" class="nav-btn" :aria-label="strings.nextMonth" :title="strings.nextMonth" @click="shiftMonth(1)">›</button>
      <button v-if="!isViewingThisMonth || selected !== todayKey()" type="button" class="today-btn" @click="goToday">
        {{ strings.backToToday }}
      </button>
    </div>

    <!-- 每一格的 aria-label 已經包含完整日期（含星期），星期標題列只是給眼睛看的。 -->
    <div class="calendar" role="group" :aria-label="monthTitle">
      <div class="weekday" v-for="(w, i) in weekdayNames" :key="i" aria-hidden="true">{{ w }}</div>
      <div v-for="n in leadingBlanks" :key="'b' + n" class="day blank" aria-hidden="true"></div>
      <button
        v-for="cell in dayCells"
        :key="cell.key"
        type="button"
        class="day"
        :class="{ 'has-entry': !!cell.entry, 'is-today': cell.isToday, 'is-selected': cell.key === selected }"
        :style="cell.entry ? { '--c': moodColor(cell.entry.mood) } : null"
        :aria-pressed="cell.key === selected"
        :aria-label="cellLabel(cell)"
        @click="selected = cell.key"
      >
        <span class="day-num">{{ cell.day }}</span>
        <span class="marks" aria-hidden="true">
          <span v-if="cell.anniversaries.length">♥</span><span v-if="cell.isFirstMet">⭐</span>
        </span>
      </button>
    </div>
    <p class="month-summary">{{ strings.entryCount(monthEntryCount) }}</p>

    <article class="entry" aria-live="polite">
      <header>
        <span v-if="selectedEntry" class="mood-dot" :style="{ background: moodColor(selectedEntry.mood) }" aria-hidden="true"></span>
        <time :datetime="selected">{{ formatDate(selected) }}</time>
        <span v-if="selectedEntry" class="mood-name">· {{ strings.moodNames[selectedEntry.mood] || strings.moodNames.calm }}</span>
      </header>
      <p v-for="a in selectedAnniversaries" :key="a.name" class="entry-mark">♥ {{ a.name }}</p>
      <p v-if="selected === firstMetAt" class="entry-mark">⭐ {{ strings.firstMetMark }}</p>

      <!-- 兩個頁籤：那天的日記／那天的全部對話（GET /api/history/day，從永久封存讀） -->
      <div class="tabs" role="tablist">
        <button
          v-for="tb in ['diary', 'chat']"
          :key="tb"
          type="button"
          role="tab"
          class="tab"
          :class="{ active: tab === tb }"
          :aria-selected="tab === tb"
          @click="tab = tb"
        >
          {{ tb === 'diary' ? strings.tabDiary : strings.tabChat }}
        </button>
      </div>

      <div v-if="tab === 'diary'" role="tabpanel">
        <p v-if="selectedEntry" class="entry-text">{{ selectedEntry.text }}</p>
        <p v-else-if="loaded" class="entry-empty">{{ entries.length === 0 ? strings.empty : strings.noEntry }}</p>
      </div>
      <div v-else role="tabpanel" class="day-chat">
        <p v-if="dayChatState === 'loading'" class="entry-empty">{{ strings.chatLoading }}</p>
        <p v-else-if="dayChatState === 'error'" class="entry-empty">{{ strings.chatFailed }}</p>
        <p v-else-if="!dayChat.length" class="entry-empty">{{ strings.noChat }}</p>
        <template v-else>
          <div v-for="(m, i) in dayChat" :key="i" class="line" :class="m.role">
            <span class="line-time">{{ hhmm(m.ts) }}</span>
            <span class="line-who">{{ m.role === 'user' ? youLabel : companionName }}</span>
            <span class="line-text">{{ m.content }}</span>
          </div>
        </template>
      </div>
    </article>
  </BaseDialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import BaseDialog from './BaseDialog.vue';
import { moodColor } from '../moods.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  strings: { type: Object, required: true },
  // profile.anniversaries（App.vue 傳進來），用來在月曆上標 ♥
  anniversaries: { type: Array, default: () => [] },
  // 親密度（App.vue 從 /api/companion 拿到的）與相關文字
  growth: { type: Object, default: null },
  growthStrings: { type: Object, default: () => ({}) },
  levelTitles: { type: Array, default: () => [] },
  // 對話頁籤用：角色名字、「你」
  companionName: { type: String, default: '' },
  youLabel: { type: String, default: '' }
});

// ---- 頁籤：日記／對話 ----
const tab = ref('diary');
const dayChat = ref([]);
const dayChatState = ref('idle'); // idle | loading | error | done
const dayChatCache = new Map(); // 日期 → 訊息（這次打開面板期間）
const hhmm = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
async function loadDayChat(date) {
  if (dayChatCache.has(date) && date !== todayKey()) {
    dayChat.value = dayChatCache.get(date);
    dayChatState.value = 'done';
    return;
  }
  dayChatState.value = 'loading';
  try {
    const res = await fetch(`/api/history/day?date=${date}`);
    if (!res.ok) throw new Error();
    const { messages } = await res.json();
    if (selected.value !== date) return; // 載入期間又點了別天
    dayChat.value = messages || [];
    dayChatCache.set(date, dayChat.value);
    dayChatState.value = 'done';
  } catch {
    dayChatState.value = 'error';
  }
}

const levelTitle = computed(() => props.levelTitles[(props.growth?.level || 1) - 1] || '');
defineEmits(['close']);

const entries = ref([]);
const firstMetAt = ref(null);
const loaded = ref(false);
const writing = ref(false);
const notice = ref('');
const writeBtnEl = ref(null);

// ---- 日期小工具：一律用「本地日期」，不要用 new Date('YYYY-MM-DD')（會被當成 UTC 午夜，差一天）。
const pad = (n) => String(n).padStart(2, '0');
function keyOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayKey() {
  return keyOf(new Date());
}
function parseLocalDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 目前看的月份（該月 1 號）跟選到的那一天
const viewMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const selected = ref(todayKey());

const entryByDate = computed(() => Object.fromEntries(entries.value.map((e) => [e.date, e])));
const hasToday = computed(() => !!entryByDate.value[todayKey()]);
const selectedEntry = computed(() => entryByDate.value[selected.value] || null);

const daysTogether = computed(() => {
  if (!firstMetAt.value) return 0;
  const diff = Math.round((parseLocalDate(todayKey()) - parseLocalDate(firstMetAt.value)) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
});

function anniversariesOn(key) {
  const md = key.slice(5); // MM-DD，紀念日每年同一天
  return props.anniversaries.filter((a) => typeof a?.date === 'string' && a.date.slice(5) === md);
}
const selectedAnniversaries = computed(() => anniversariesOn(selected.value));

const isViewingThisMonth = computed(() => {
  const now = new Date();
  return viewMonth.value.getFullYear() === now.getFullYear() && viewMonth.value.getMonth() === now.getMonth();
});

// 週日開頭（台灣、日本的月曆習慣）。
const leadingBlanks = computed(() => viewMonth.value.getDay());
const dayCells = computed(() => {
  const y = viewMonth.value.getFullYear();
  const m = viewMonth.value.getMonth();
  const count = new Date(y, m + 1, 0).getDate();
  const today = todayKey();
  return Array.from({ length: count }, (_, i) => {
    const key = keyOf(new Date(y, m, i + 1));
    return {
      key,
      day: i + 1,
      entry: entryByDate.value[key] || null,
      isToday: key === today,
      isFirstMet: key === firstMetAt.value,
      anniversaries: anniversariesOn(key)
    };
  });
});
const monthEntryCount = computed(() => dayCells.value.filter((c) => c.entry).length);

const monthTitle = computed(() => {
  try {
    return new Intl.DateTimeFormat(props.strings.locale, { year: 'numeric', month: 'long' }).format(viewMonth.value);
  } catch {
    return `${viewMonth.value.getFullYear()}-${pad(viewMonth.value.getMonth() + 1)}`;
  }
});
const weekdayNames = computed(() => {
  // 2023-01-01 是星期日，往後 7 天剛好是日～六
  const fmt = new Intl.DateTimeFormat(props.strings.locale, { weekday: 'narrow' });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)));
});

function formatDate(key) {
  const label = new Intl.DateTimeFormat(props.strings.locale, { month: 'long', day: 'numeric', weekday: 'short' }).format(
    parseLocalDate(key)
  );
  return key === todayKey() ? `${props.strings.today}（${label}）` : label;
}

function cellLabel(cell) {
  const parts = [formatDate(cell.key)];
  if (cell.entry) parts.push(`${props.strings.hasEntry}（${props.strings.moodNames[cell.entry.mood] || ''}）`);
  if (cell.anniversaries.length) parts.push(`${props.strings.anniversaryMark}：${cell.anniversaries.map((a) => a.name).join('、')}`);
  if (cell.isFirstMet) parts.push(props.strings.firstMetMark);
  return parts.join('，');
}

function shiftMonth(delta) {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + delta, 1);
}

function goToday() {
  const now = new Date();
  viewMonth.value = new Date(now.getFullYear(), now.getMonth(), 1);
  selected.value = todayKey();
}

async function load() {
  notice.value = '';
  try {
    const res = await fetch('/api/diary');
    const data = await res.json();
    entries.value = Array.isArray(data.entries) ? data.entries : [];
    firstMetAt.value = data.firstMetAt || null;
  } catch {
    entries.value = [];
  } finally {
    loaded.value = true;
  }
  // 打開時停在這個月；今天有日記就選今天，沒有的話選這個月最近寫的那篇，都沒有就選今天。
  goToday();
  if (!hasToday.value) {
    const latestThisMonth = dayCells.value.filter((c) => c.entry && c.key <= todayKey()).pop();
    if (latestThisMonth) selected.value = latestThisMonth.key;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      dayChatCache.clear();
      tab.value = 'diary';
      load();
    }
  }
);
// 切到對話頁籤、或在對話頁籤點了別天 → 讀那天的對話
watch([tab, () => selected.value], ([tb, date]) => {
  if (tb === 'chat' && date) loadDayChat(date);
});

async function writeToday() {
  if (writing.value) return;
  writing.value = true;
  notice.value = '';
  try {
    const res = await fetch('/api/diary/today', { method: 'POST' });
    if (!res.ok) throw new Error('bad response');
    const { entry } = await res.json();
    if (!entry) {
      notice.value = props.strings.nothingToday;
      return;
    }
    entries.value = [entry, ...entries.value.filter((e) => e.date !== entry.date)];
    goToday();
  } catch {
    notice.value = props.strings.failed;
  } finally {
    writing.value = false;
    // 寫日記期間按鈕是 disabled，瀏覽器會把焦點丟回整個頁面（鍵盤使用者等於被踢出對話框），
    // 寫完把焦點還給按鈕。
    nextTick(() => writeBtnEl.value?.focus());
  }
}
</script>

<style scoped>
.days-together {
  margin: 0;
  font-size: 13px;
  color: #a5502f;
  font-weight: 600;
}

.growth {
  background: #fff;
  border-radius: 12px;
  padding: 8px 12px 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.growth-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}
.streak {
  font-size: 12px;
  color: #d9662f;
}
.growth-bar {
  height: 8px;
  border-radius: 999px;
  background: #f1e6d8;
  margin: 6px 0 2px;
  overflow: hidden;
}
.growth-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #ff9dbf, #ff7a59);
  transition: width 0.6s ease;
}
.growth-next {
  margin: 0;
  font-size: 11px;
  opacity: 0.6;
  text-align: right;
}

.write-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.write-btn {
  border: 1px dashed #c9b89e;
  background: transparent;
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 13px;
  color: #7a5c3a;
}
.write-btn:disabled {
  opacity: 0.6;
}
.notice {
  margin: 0;
  font-size: 12px;
  opacity: 0.75;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}
.month-title {
  margin: 0;
  font-size: 15px;
  min-width: 7.5em;
  text-align: center;
}
.nav-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #e3d6c5;
  background: #fff;
  font-size: 18px;
  line-height: 1;
  color: #7a5c3a;
}
.today-btn {
  margin-left: auto;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #a5502f;
  text-decoration: underline;
}

.calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.weekday {
  text-align: center;
  font-size: 11px;
  opacity: 0.6;
  padding-bottom: 2px;
}
.day {
  position: relative;
  aspect-ratio: 1 / 1;
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: #fff;
  color: inherit;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.day.blank {
  background: transparent;
}
.day.has-entry {
  background: var(--c);
  background: color-mix(in srgb, var(--c) 38%, #ffffff);
  font-weight: 600;
}
.day.is-today {
  border-color: #ff7a59;
}
.day.is-selected {
  box-shadow: 0 0 0 2px #4a3a2a inset;
}
.marks {
  font-size: 9px;
  line-height: 1;
  min-height: 9px;
  color: #d9466f;
}

.month-summary {
  margin: -6px 0 0;
  font-size: 12px;
  opacity: 0.65;
  text-align: right;
}

.entry {
  background: #ffffff;
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.entry header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.85;
}
.mood-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.mood-name {
  font-weight: 400;
}
.entry-mark {
  margin: 6px 0 0;
  font-size: 13px;
  color: #d9466f;
}
.entry-text {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.tabs {
  display: flex;
  gap: 4px;
  margin: 8px 0 4px;
  border-bottom: 1px solid #eee2d2;
}
.tab {
  border: none;
  background: transparent;
  padding: 6px 12px;
  font-size: 13px;
  font-family: inherit;
  color: #8a7058;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
}
.tab.active {
  color: #4a3a2a;
  font-weight: 700;
  border-bottom-color: #ff7a59;
}
.day-chat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 40vh;
  overflow-y: auto;
  padding-top: 4px;
}
.line {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
  align-items: baseline;
}
.line-time {
  font-size: 11px;
  opacity: 0.5;
}
.line-who {
  font-weight: 700;
  white-space: nowrap;
}
.line.user .line-who {
  color: #2f6fb3;
}
.line.assistant .line-who {
  color: #c2553a;
}
.line-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.entry-empty {
  margin: 6px 0 0;
  font-size: 13px;
  opacity: 0.6;
}
</style>
