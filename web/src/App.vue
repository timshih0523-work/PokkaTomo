<template>
  <div class="app-root" :class="[isNight ? 'is-night' : 'is-day', showChat ? 'chat-shown' : 'chat-hidden']">
    <div class="top-bar">
      <!-- 標題＝現在的角色名字，按一下回到選角色畫面 -->
      <button type="button" class="app-title" :title="t.picker.switchLabel" :aria-label="`${companionName}，${t.picker.switchLabel}`" @click="openPicker">
        {{ profile.nickname ? `${profile.nickname}${t.appTitleSuffix}` : companionName }} <span class="caret" aria-hidden="true">▾</span>
      </button>
      <div class="top-bar-right" ref="topRightEl">
        <!-- 有問題時只顯示一個紅色三角形驚嘆號，按一下才在下面顯示是什麼問題（不直接把訊息寫在上方列） -->
        <div v-if="fmWarning" class="warn-wrap" ref="warnWrapEl">
          <button
            type="button"
            class="warn-btn"
            :aria-expanded="warnOpen"
            :aria-label="t.warnButtonLabel"
            :title="t.warnButtonLabel"
            @click="warnOpen = !warnOpen"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M12 2.8 L22.4 20.6 Q23 21.8 21.6 21.8 H2.4 Q1 21.8 1.6 20.6 Z" fill="#e53935" stroke="#b71c1c" stroke-width="1.2" stroke-linejoin="round" />
              <rect x="10.9" y="8.2" width="2.2" height="7.4" rx="1.1" fill="#fff" />
              <circle cx="12" cy="18.3" r="1.3" fill="#fff" />
            </svg>
          </button>
          <Transition name="menu-pop">
            <div v-if="warnOpen" class="warn-pop" role="alert">{{ fmWarning }}</div>
          </Transition>
        </div>
        <!-- 功能類：天氣、占卜、記得的事、日記 -->
        <div class="top-group feature-group" ref="featureGroupEl">
          <!-- 天氣徽章：按一下打開／收起每小時天氣（HourlyWeather.vue） -->
          <div v-if="weather" class="weather-wrap" ref="weatherWrapEl">
            <button
              type="button"
              class="weather-badge"
              :aria-expanded="hourlyOpen"
              :aria-label="`${t.weatherLabel(weather.locationName, weather.current.temp)}，${hourlyOpen ? t.hourly.toggleHide : t.hourly.toggleShow}`"
              :title="hourlyOpen ? t.hourly.toggleHide : t.hourly.toggleShow"
              @click="hourlyOpen = !hourlyOpen"
            >
              {{ weather.current.emoji }} {{ weather.current.temp }}° <span class="caret" aria-hidden="true">{{ hourlyOpen ? '▴' : '▾' }}</span>
            </button>
            <HourlyWeather v-if="hourlyOpen" :weather="weather" :strings="t.hourly" :now="hourlyNow" />
          </div>
          <!-- 今日占卜（一天一次，之後再按是再看一次同一個結果） -->
          <button
            type="button"
            class="settings-btn fortune-btn"
            :disabled="fortuneLoading"
            :aria-label="fortuneToday ? t.fortune.again : t.fortune.button"
            :title="fortuneToday ? t.fortune.again : t.fortune.button"
            @click="drawFortune"
          >
            🔮
          </button>
          <button type="button" class="settings-btn" @click="memoryOpen = true" :aria-label="t.memoryButtonLabel" :title="t.memoryButtonLabel">
            💝
          </button>
          <button type="button" class="settings-btn" @click="diaryOpen = true" :aria-label="t.diaryButtonLabel" :title="t.diaryButtonLabel">
            📔
          </button>
        </div>

        <!-- 設定類：介面語言、聲音、對話泡泡、設定面板。
             空間夠就直接排在功能類旁邊；不夠（fitTopBar 量出來的）就收進一個「🎛️」按鈕，按了才在下面展開。 -->
        <div v-if="!settingsCollapsed" class="top-group setting-group">
          <span class="group-divider" aria-hidden="true"></span>
          <button
            v-for="b in settingButtons"
            :key="b.key"
            type="button"
            :class="b.cls"
            :aria-label="b.label"
            :title="b.label"
            :aria-pressed="b.pressed"
            @click="b.onClick"
          >
            {{ b.icon }}<span v-if="b.text" class="lang-text"> {{ b.text }}</span>
          </button>
        </div>
        <div v-else class="setting-menu" ref="settingMenuEl">
          <button
            type="button"
            class="settings-btn setting-menu-toggle"
            :class="{ active: settingMenuOpen }"
            :aria-expanded="settingMenuOpen"
            :aria-label="settingMenuOpen ? t.settingMenuHide : t.settingMenuShow"
            :title="settingMenuOpen ? t.settingMenuHide : t.settingMenuShow"
            @click="settingMenuOpen = !settingMenuOpen"
          >
            🎛️
          </button>
          <!-- 展開的設定類按鈕：絕對定位在上層，不會推動角色 -->
          <Transition name="menu-pop">
            <div v-if="settingMenuOpen" class="setting-menu-pop" role="group" :aria-label="t.settingMenuShow">
              <button
                v-for="b in settingButtons"
                :key="b.key"
                type="button"
                :class="b.cls"
                :aria-label="b.label"
                :title="b.label"
                :aria-pressed="b.pressed"
                @click="onMenuButton(b)"
              >
                {{ b.icon }}<span v-if="b.text" class="lang-text-menu"> {{ b.text }}</span>
              </button>
            </div>
          </Transition>
        </div>

        <!-- 量寬度用：設定類「全部攤開」時要多寬（看不到、點不到） -->
        <div class="top-group setting-group measure" ref="settingMeasureEl" aria-hidden="true">
          <span class="group-divider"></span>
          <button v-for="b in settingButtons" :key="b.key" type="button" tabindex="-1" :class="b.cls">
            {{ b.icon }}<span v-if="b.text" class="lang-text"> {{ b.text }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 點擊判斷只在角色身上（見 SvgAvatar.vue 的感應區），點這一大塊區域的空白處不會有反應 -->
    <div class="avatar-stage" ref="stageEl">
      <!-- 反應泡泡要跟著角色本身的框走，不能是跟著這個 .avatar-stage（它是撐滿整個
           寬度的容器，角色只是置中顯示在裡面）——之前泡泡是用 .avatar-stage 的寬度算
           left/right 百分比，螢幕越寬，泡泡跟角色實際的距離就越遠，變成貼在畫面兩側，
           跟角色完全脫節。現在改成用 .avatar-anchor 這個「剛好包住角色」的框當基準，
           泡泡的位置就會永遠貼著角色，不管視窗多寬都一樣。 -->
      <SeasonDecor :events="events" :names="t.events" />
      <div class="avatar-anchor" ref="anchorEl">
        <Transition name="bubble-pop">
          <div
            v-if="showReaction"
            class="reaction-bubble"
            :class="reactionSide === 'left' ? 'bubble-left' : 'bubble-right'"
          >
            {{ reactionText }}
          </div>
        </Transition>
        <!-- 漫畫對話泡泡：文字對話隱藏時，角色說的話從頭的左上／右上冒出來（絕對定位，不會推動角色） -->
        <Transition name="speech-pop">
          <div
            v-if="!showChat && showSpeech && (speech || thinkingNow)"
            :key="thinkingNow && !speech ? 'thinking' : speechKey"
            class="speech-bubble"
            :class="[speechSide === 'left' ? 'speech-left' : 'speech-right', { 'speech-beside': speechFit.beside }]"
            :style="speechFit.style"
            aria-live="polite"
          >
            <!-- 內容太長時在裡面捲動（外層不能 overflow，不然尾巴會被切掉）；
                 高度依畫面上實際剩下的空間算（fitSpeechBubble），唸的時候會跟著捲 -->
            <div class="speech-body" ref="speechBodyEl" :class="{ 'has-more': speechHasMore }" :style="{ maxHeight: speechFit.bodyMax + 'px' }" @scroll.passive="updateSpeechMore" @wheel.passive="speechUserScrolled = true" @touchmove.passive="speechUserScrolled = true">
              <template v-if="speech">
                <strong v-if="speech.kind === 'levelup'">{{ t.growth.levelUpTitle(speech.level, t.levelTitles[speech.level - 1]) }}</strong>
                <template v-else>{{ speech.content }}</template>
                <button v-if="speech.retryText" type="button" class="retry-btn" :disabled="isSending" @click="retryMessage(speech)">
                  ↻ {{ t.retry }}
                </button>
              </template>
              <span v-else-if="showSlowHint" class="speech-thinking-text">{{ t.thinkingSlowHint }}</span>
              <span v-else class="speech-dots" aria-hidden="true"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
            </div>
          </div>
        </Transition>
        <!-- 今日占卜的結果：蓋在角色上面的小視窗，按 ✕ 關閉 -->
        <Transition name="bubble-pop">
          <div v-if="fortunePopup" class="fortune-pop" role="dialog" :aria-label="t.fortune.title">
            <button type="button" class="pop-close" :aria-label="t.diary.close" :title="t.diary.close" @click="fortunePopup = null">✕</button>
            <FortuneCard :fortune="fortunePopup" :strings="t.fortune" />
          </div>
        </Transition>
        <AvatarAdapter
          :status="status"
          :mood="mood"
          :label="t.touchLabel"
          :quirk="quirk"
          :accessory="accessory"
          :variant="profile.avatarStyle === 'classic' ? 'classic' : 'full'"
          :palette="profile.palette || 'peach'"
          @touch="onAvatarTouch"
          @hover="onAvatarHover"
        />
      </div>
    </div>

    <!-- 聊天紀錄 + 輸入區包成一欄：窄畫面時跟角色上下排，寬畫面（見 styles.css 的 RWD 段落）
         時放在角色右邊，聊天紀錄可以長高，不用擠在畫面下面那一小塊。 -->
    <div class="conversation">
      <div v-show="showChat" class="chat-log" ref="chatLogEl" role="log" aria-live="polite">
        <template v-if="earlierOpen">
          <template v-for="(m, i) in earlierMessages" :key="`e${i}`">
            <FortuneCard v-if="m.kind === 'fortune' && m.fortune" :fortune="m.fortune" :strings="t.fortune" />
            <div v-else class="bubble earlier" :class="m.role">
              <span class="bubble-time">{{ hhmm(m.ts) }}</span>{{ m.content }}
            </div>
          </template>
          <div class="earlier-divider" role="separator">{{ t.today.divider }}</div>
        </template>
        <template v-for="(m, i) in messages" :key="i">
          <FortuneCard v-if="m.kind === 'fortune' && m.fortune" :fortune="m.fortune" :strings="t.fortune" />
          <div v-else-if="m.kind === 'levelup'" class="bubble assistant levelup-card">
            <strong>{{ t.growth.levelUpTitle(m.level, t.levelTitles[m.level - 1]) }}</strong>
            <span>{{ t.growth.levelUpBody }}</span>
          </div>
          <div v-else class="bubble" :class="m.role">
            {{ m.content }}
            <button
              v-if="m.retryText"
              type="button"
              class="retry-btn"
              :disabled="isSending"
              @click="retryMessage(m)"
            >
              ↻ {{ t.retry }}
            </button>
          </div>
        </template>
        <div v-if="status === 'THINKING' || greetPending" class="bubble assistant thinking-bubble">
          <span v-if="showSlowHint">{{ t.thinkingSlowHint }}</span>
          <template v-else>
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </template>
        </div>
      </div>


      <div class="controls">
        <!-- 文字對話顯示／隱藏（主要用語音；預設隱藏，會記住）＋今天稍早的對話（只在文字對話打開時出現），放在一起不用捲到最上面 -->
        <div class="chat-toggles">
          <button type="button" class="chat-toggle" :aria-pressed="showChat" @click="toggleChat">
            💬 {{ showChat ? t.chatToggleHide : t.chatToggleShow }}
          </button>
          <button
            v-if="showChat && (earlierCount > 0 || earlierOpen)"
            type="button"
            class="chat-toggle"
            :aria-pressed="earlierOpen && showChat"
            :disabled="earlierLoading"
            @click="toggleEarlier"
          >
            {{ earlierLoading ? t.today.loading : earlierOpen && showChat ? t.today.hide : t.today.show(earlierCount) }}
          </button>
        </div>
        <HoldToSpeakButton
          :disabled="status === 'THINKING' || status === 'SPEAKING' || isSending"
          :busy-hint="status === 'SPEAKING' ? t.hintTapToStop : ''"
          :idle-hint="status === 'ASLEEP' ? t.hintAsleep : ''"
          :lang="vt.speechLang"
          :strings="t"
          @start-listening="onStartListening"
          @stop-listening="onStopListening"
          @result="onVoiceResult"
          @voice-error="onVoiceError"
        />
      </div>
    </div>

    <!-- 升級的時候撒一次彩帶（key 改變就重新播一次） -->
    <ParticleLayer v-if="celebrateKey" :key="celebrateKey" kind="confetti" :count="36" :loop="false" />

    <DiaryPanel
      :open="diaryOpen"
      :strings="t.diary"
      :growth="growth"
      :growth-strings="t.growth"
      :level-titles="t.levelTitles"
      :anniversaries="profile.anniversaries || []"
      :companion-name="companionName"
      :you-label="t.diary.you"
      @close="diaryOpen = false"
    />

    <MemoryPanel
      :open="memoryOpen"
      :strings="t.memory"
      :profile="profile"
      :companion-name="companionName"
      :you-label="t.diary.you"
      :language="language"
      @close="memoryOpen = false"
      @updated="(p) => (profile = { ...profile, ...p })"
    />

    <SettingsPanel
      :open="settingsOpen"
      :profile="profile"
      :strings="t.settings"
      :palette-names="t.paletteNames"
      :voices="availableVoices"
      :language="voiceLanguage"
      :language-name="vt.label"
      :lock-strings="t.lock"
      @preview-voice="previewVoice"
      @imported="onImported"
      @close="settingsOpen = false"
      @saved="onProfileSaved"
    />

    <Transition name="toast-fade">
      <div v-if="toast" class="toast" :class="`toast-${toast.kind}`" role="status">
        {{ toast.kind === 'ok' ? '✅' : '⚠️' }} {{ toast.text }}
      </div>
    </Transition>

    <!-- 選角色（輸入密碼後、或按左上角名字） -->
    <CharacterPicker
      v-if="pickerOpen && !lockMode"
      :strings="t.picker"
      :style-names="{ full: t.settings.avatarFull, classic: t.settings.avatarClassic }"
      :palette-names="t.paletteNames"
      :default-name="t.defaultName"
      :current-id="session.characterId"
      :language="language"
      :lock-strings="t.lock"
      @select="onSelectCharacter"
      @deleted="onCharacterDeleted"
    />

    <!-- 密碼蓋板：一打開、閒置 15 分鐘、伺服器說要重新輸入時。放最後，蓋在所有東西上面 -->
    <LockScreen v-if="lockMode" :key="lockMode" :mode="lockMode" :strings="t.lock" @unlocked="onUnlocked" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import AvatarAdapter from './components/AvatarAdapter.vue';
import HoldToSpeakButton from './components/HoldToSpeakButton.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import DiaryPanel from './components/DiaryPanel.vue';
import MemoryPanel from './components/MemoryPanel.vue';
import SeasonDecor from './components/SeasonDecor.vue';
import ParticleLayer from './components/ParticleLayer.vue';
import FortuneCard from './components/FortuneCard.vue';
import HourlyWeather from './components/HourlyWeather.vue';
import { useQuirks, reactionQuirkFor } from './composables/useQuirks.js';
import { seasonalOutfit } from './outfits.js';
import { MOODS, DEFAULT_MOOD } from './moods.js';
import { useAvatarStatus } from './composables/useAvatarStatus.js';
import { useVoice } from './composables/useVoice.js';
import { getStrings, LANGUAGES } from './i18n.js';
import { loadLimits } from './limits.js';
import { reportClient } from './clientLog.js';
import { session, onLocked } from './api.js';
import { loadVoices, pickVoice } from './voices.js';
import LockScreen from './components/LockScreen.vue';
import CharacterPicker from './components/CharacterPicker.vue';

const { status, isNight, setStatus, restToIdle, setAsleep } = useAvatarStatus();
const { speak, stopSpeaking } = useVoice();

const messages = ref([]);
const chatLogEl = ref(null);
// 完整的 profile（角色：名字、個性、語言…；使用者：稱呼、喜好、紀念日…）。
// SettingsPanel 讀這個來初始化表單，存檔成功後也是更新這個物件。
const profile = ref({ nickname: '', personaPrompt: '', preferences: [], anniversaries: [] });
const settingsOpen = ref(false);
const diaryOpen = ref(false);
const memoryOpen = ref(false); // 「記得的事」彈窗

// 目前的情緒（見 server/lib/mood.js）：驅動角色的心情燈、表情、說話語調。
// AI 每說一句話就更新一次；一段時間沒新的情緒就慢慢回到平靜，不會一直停在難過。
const mood = ref(DEFAULT_MOOD);
let moodDecayTimer = null;
const MOOD_DECAY_MS = 15000;
function setMood(next) {
  mood.value = MOODS.includes(next) ? next : DEFAULT_MOOD;
  clearTimeout(moodDecayTimer);
  if (mood.value !== DEFAULT_MOOD) {
    moodDecayTimer = setTimeout(() => {
      mood.value = DEFAULT_MOOD;
    }, MOOD_DECAY_MS);
  }
}

// ---- 聲音（見 voices.js）：每個角色可以選自己的聲音、音高、語速（設定面板），
// 再依這句話的情緒「微調」。以前是固定把音高拉到 1.15～1.3，好的聲音也會被拉得很假，現在只小幅調整。
const MOOD_VOICE = {
  joy: { rate: 1.04, pitch: 1.05 },
  love: { rate: 0.98, pitch: 1.03 },
  calm: { rate: 1.0, pitch: 1.0 },
  sad: { rate: 0.93, pitch: 0.95 },
  worried: { rate: 0.97, pitch: 0.98 },
  surprised: { rate: 1.06, pitch: 1.08 }
};
const availableVoices = ref([]);
loadVoices().then((v) => (availableVoices.value = v));
if (typeof window !== 'undefined' && window.speechSynthesis?.addEventListener) {
  window.speechSynthesis.addEventListener('voiceschanged', () => (availableVoices.value = window.speechSynthesis.getVoices()));
}
/** 目前角色、目前語言、這個情緒要用的聲音設定 */
function voiceOptions(moodName = mood.value) {
  const m = MOOD_VOICE[moodName] || MOOD_VOICE.calm;
  const p = profile.value;
  const preferred = p.voice;
  return {
    lang: vt.value.speechLang,
    voice: pickVoice(availableVoices.value, voiceLanguage.value, preferred),
    pitch: Math.min(2, (p.voicePitch || 1.05) * m.pitch),
    rate: Math.min(2, (p.voiceRate || 1.0) * m.rate),
    onProgress: onSpeechProgress
  };
}

// ---- 角色的生活狀態（後端 server/companionService.js）：親密度、睡覺、今天的節日、今天占卜過沒 ----
const growth = ref(null); // { level, points, currentMin, nextMin, progress, streakDays }
const events = ref([]); // 今天的節日 id，例如 ['christmas']
const fortuneToday = ref(false);
const celebrateKey = ref(0);

async function loadCompanion() {
  try {
    const res = await fetch('/api/companion');
    if (!res.ok) return;
    const data = await res.json();
    growth.value = data.growth;
    events.value = (data.events || []).map((e) => e.id);
    fortuneToday.value = !!data.fortuneToday;
    setAsleep(!!data.asleep);
  } catch {
    /* 拿不到就先用預設（醒著、沒節日） */
  }
}

// 節日 → 角色頭上的配件；沒有節日時換季服裝（春：小花、夏：草帽、秋：貝雷帽、冬：圍巾）
const accessory = computed(() => {
  const ev = events.value;
  if (ev.includes('christmas') || ev.includes('christmasEve')) return 'santa';
  if (ev.includes('halloween')) return 'witch';
  if (ev.includes('sakura')) return 'sakura';
  // events 每 10 分鐘重新拿一次（跨日、換季時跟著重算）
  return seasonalOutfit(new Date());
});

const level = computed(() => growth.value?.level || 1);

function applyGrowth(g, levelUp) {
  if (g) growth.value = { ...(growth.value || {}), ...g };
  if (levelUp && g) celebrate(g.level);
}

// 升級：撒彩帶、角色開心、聊天紀錄裡放一張「親密度升級」卡片（只在畫面上，不寫進紀錄）。
function celebrate(newLevel) {
  celebrateKey.value += 1;
  messages.value.push({ role: 'assistant', kind: 'levelup', level: newLevel });
  scrollToBottom();
  setMood('joy');
  setStatus('HAPPY', { autoRestMs: 2500 });
  showBubble('🎉');
  setTimeout(() => quirks.playQuirk('dance', { line: false }), 2600); // 開心到跳舞
}

// 摸摸頭：每 1.5 秒最多算一次（連點不會一直打 API），每天的加分上限在後端。
let lastPatAt = 0;
async function sendPat(part = 'body') {
  const now = Date.now();
  if (now - lastPatAt < 1500) return;
  lastPatAt = now;
  try {
    // 摸了哪裡也記下來（後端統計，常被摸的部位會影響牠的個性，見 companionService.js）
    const res = await fetch('/api/companion/pat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part })
    });
    if (!res.ok) return;
    const data = await res.json();
    applyGrowth(data.growth, data.levelUp);
  } catch {
    /* 摸頭失敗不影響任何事 */
  }
}

// 今日占卜（server/fortuneService.js）
const fortuneLoading = ref(false);
async function drawFortune() {
  if (fortuneLoading.value) return;
  fortuneLoading.value = true;
  userHasInteracted = true;
  try {
    const res = await fetch('/api/fortune', { method: 'POST' });
    if (!res.ok) throw new Error('bad response');
    const { fortune } = await res.json();
    messages.value.push({ role: 'assistant', kind: 'fortune', fortune });
    fortunePopup.value = fortune;
    fortuneToday.value = true;
    await scrollToBottom();
    setMood(fortune.mood || 'joy');
    setStatus('HAPPY', { autoRestMs: 1800 });
  } catch {
    showBubble(t.value.fortune.failed);
  } finally {
    fortuneLoading.value = false;
  }
}

// 使用者在這個分頁裡有沒有互動過（講過話、點過角色）。瀏覽器規定要先有使用者操作才能出聲，
// 所以主動問候只有在互動過之後（例如切回這個分頁時）才唸出來，剛打開網頁時只顯示文字。
let userHasInteracted = false;

// 打開設定面板前先跟伺服器拿一次最新的 profile。
// 為什麼不能直接用手上這份：背景的「關鍵記憶提取」會在聊天過程中默默把學到的喜好/紀念日
// 寫進 user.json，但畫面上這份 profile 是網頁剛打開時抓的舊資料。以前用舊資料
// 填表單，使用者只是改個暱稱按儲存，整份舊的喜好/紀念日清單就會蓋回伺服器——這次聊天裡
// PokkaTomo 學到的東西全部被刪掉，而且完全沒有任何提示。拿不到（伺服器暫時連不上）就用手上
// 這份照樣打開，不擋使用者。
async function openSettings() {
  try {
    const res = await fetch('/api/profile');
    if (res.ok) {
      profile.value = { ...profile.value, ...(await res.json()) };
    }
  } catch {
    /* 連不上就用現有的資料 */
  }
  settingsOpen.value = true;
}

// 天氣小徽章（右上角）：設定面板填了城市才會出現。伺服器那邊有快取，這裡 30 分鐘問一次就好。
// 天氣抓不到（沒網路、沒設定城市）就不顯示，不影響其他功能。
const weather = ref(null);
let weatherTimer = null;
// 每小時天氣的展開狀態。打開時記下「現在」，用來濾掉已經過去的小時。
const hourlyOpen = ref(false);
const hourlyNow = ref(Date.now());
const weatherWrapEl = ref(null);
watch(hourlyOpen, (open) => {
  if (open) hourlyNow.value = Date.now();
});
// 點面板外面、按 Esc 就收起來
function onDocPointerDown(e) {
  if (hourlyOpen.value && weatherWrapEl.value && !weatherWrapEl.value.contains(e.target)) hourlyOpen.value = false;
  // 設定類按鈕的展開選單：點外面就收起來
  if (settingMenuOpen.value && settingMenuEl.value && !settingMenuEl.value.contains(e.target)) settingMenuOpen.value = false;
  if (warnOpen.value && warnWrapEl.value && !warnWrapEl.value.contains(e.target)) warnOpen.value = false;
}
function onDocKeydown(e) {
  if (e.key !== 'Escape') return;
  if (warnOpen.value) warnOpen.value = false;
  else if (settingMenuOpen.value) settingMenuOpen.value = false;
  else if (hourlyOpen.value) hourlyOpen.value = false;
  else if (fortunePopup.value) fortunePopup.value = null;
}
document.addEventListener('pointerdown', onDocPointerDown);
document.addEventListener('keydown', onDocKeydown);

// ---- 今天稍早的對話：一打開畫面不顯示舊對話（畫面乾淨、像一段新的見面），
// 需要回顧時按聊天區最上面的按鈕，從永久封存讀今天的全部訊息（GET /api/history/day）。
// 只顯示「這次打開網頁之前」的部分，這次聊的本來就在下面。
let sessionStartedAt = Date.now(); // 換角色時重設
const earlierCount = ref(0);
const earlierMessages = ref([]);
const earlierOpen = ref(false);
const earlierLoading = ref(false);
async function fetchEarlierToday() {
  const res = await fetch('/api/history/day');
  if (!res.ok) throw new Error('bad response');
  const { messages: list } = await res.json();
  return (list || []).filter((m) => m.ts < sessionStartedAt);
}
async function loadEarlierCount() {
  try {
    earlierMessages.value = await fetchEarlierToday();
    earlierCount.value = earlierMessages.value.length;
  } catch {
    earlierCount.value = 0;
  }
}
async function toggleEarlier() {
  if (earlierOpen.value && showChat.value) {
    earlierOpen.value = false;
    return;
  }

  earlierLoading.value = true;
  try {
    earlierMessages.value = await fetchEarlierToday();
    earlierCount.value = earlierMessages.value.length;
    earlierOpen.value = true;
    await nextTick();
    if (chatLogEl.value) chatLogEl.value.scrollTop = 0; // 從今天最早的開始看
  } catch {
    showBubble(t.value.today.failed);
  } finally {
    earlierLoading.value = false;
  }
}
const hhmm = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
async function loadWeather() {
  try {
    const res = await fetch('/api/weather');
    if (!res.ok) return;
    weather.value = (await res.json()).weather || null;
  } catch {
    /* 沒天氣就算了 */
  }
}

// 設定面板的「試聽」：用表單裡還沒儲存的聲音設定唸一句
function previewVoice({ voiceURI, pitch, rate }) {
  if (status.value === 'SPEAKING') stopSpeaking();
  const voice = pickVoice(availableVoices.value, voiceLanguage.value, voiceURI);
  speak(vt.value.settings.voicePreviewText, { lang: vt.value.speechLang, voice, pitch, rate });
}

function onProfileSaved(updatedProfile, { message, warning } = {}) {
  // 設定面板存好就自己關掉，這裡跳一個小提示讓她知道有存到
  profile.value = { ...profile.value, ...updatedProfile };
  loadWeather(); // 城市可能改了
  if (message) showToast(message, warning ? 'warn' : 'ok');
}

// ---- 小提示（畫面上方中間，幾秒後消失）：設定已儲存之類的 ----
const toast = ref(null);
let toastTimer = null;
function showToast(text, kind = 'ok') {
  toast.value = { text, kind };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), kind === 'warn' ? 5000 : 2500);
}

// 兩種語言分開：
//   - language（介面顯示的語言）：畫面上的字。上方 🌐 按鈕隨時切換，存成這個角色的 uiLanguage。
//   - voiceLanguage（說話的語言＝profile.language）：角色回覆、語音朗讀／辨識、日記、占卜、稱呼、預設個性。
//     建立角色時選好就固定，不能切換（後端也會擋）。
// 例如日文角色可以用中文介面操作，但角色永遠講日文。
// 按鈕是照 LANGUAGES 陣列的順序輪流切換，不是寫死「中↔日」，
// 之後要加第三種語言的話，在 i18n.js 的 LANGUAGES/STRINGS 加一筆就會自動排進輪替順序。
const language = ref(LANGUAGES[0]);
// 角色名字可以在設定面板改（profile.companionName），介面上所有提到名字的地方都跟著換
// （i18n.js 的字典用「{name}」佔位）。沒設定就用這個語言的預設名字（PokkaTomo / ポッカとも）。
const t = computed(() => getStrings(language.value, profile.value.companionName));
const voiceLanguage = computed(() => (LANGUAGES.includes(profile.value.language) ? profile.value.language : language.value));
// 說話語言的字典：只拿來用語音相關的（speechLang、試聽句子）
const vt = computed(() => getStrings(voiceLanguage.value, profile.value.companionName));
const companionName = computed(() => profile.value.companionName?.trim() || t.value.defaultName);

// 瀏覽器分頁標題也跟著名字走。
watch(
  companionName,
  (name) => {
    if (typeof document !== 'undefined') document.title = name;
  },
  { immediate: true }
);

// <html lang> 跟著介面語言切換：瀏覽器會依這個值挑字形——lang 一直停在 zh-Hant 的話，
// 日文畫面的漢字會用中文字形畫出來（例如「直」「骨」的寫法跟日本習慣不一樣，日本人
// 一看就覺得怪），螢幕報讀器也會用錯的語言去唸。styles.css 也有依 :lang(ja) 換字型。
watch(
  () => t.value.htmlLang,
  (lang) => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  },
  { immediate: true }
);

// 朗讀開關：在公共場所、半夜不想吵到人時可以關掉聲音，只看文字。這是這台瀏覽器自己的
// 偏好（不是 AI 的設定），存在 localStorage 就好；讀寫失敗（無痕模式等）就當作沒關。
const MUTE_KEY = 'pokkatomo.muted';
function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
const muted = ref(readMuted());
function toggleMute() {
  muted.value = !muted.value;
  try {
    localStorage.setItem(MUTE_KEY, muted.value ? '1' : '0');
  } catch {
    /* noop */
  }
  if (muted.value && status.value === 'SPEAKING') stopSpeaking();
}

// fmWarning 只記錄「目前是哪一種警告」，實際顯示的文字交給 t（語言字典），
// 這樣切換語言時警告文字也會跟著變。
const fmWarningKey = ref(''); // '' | 'fmUnavailable' | 'backendUnreachable'
const fmWarning = computed(() => (fmWarningKey.value ? t.value[fmWarningKey.value] : ''));
// 紅色驚嘆號按下去才顯示訊息；問題解除（警告消失）時一起收起來
const warnOpen = ref(false);
const warnWrapEl = ref(null);
watch(fmWarningKey, (k) => {
  if (!k) warnOpen.value = false;
});

const reactionText = ref('');
const reactionSide = ref('right');
const showReaction = ref(false);
let lastReactionIndex = -1;
let reactionHideTimer = null;

function pickFrom(pool) {
  if (pool.length === 1) return pool[0];
  let idx;
  do {
    idx = Math.floor(Math.random() * pool.length);
  } while (idx === lastReactionIndex);
  lastReactionIndex = idx;
  return pool[idx];
}

// 讓角色跳出反應泡泡，點角色（pickFrom(t.value.reactions)）跟聊天出錯時
// （pickFrom(t.value.errorReactions)）共用同一套視覺機制，泡泡位置隨機從左上/右上冒出來。
// side：摸的是左耳／左臉頰就從左邊冒出來，右邊同理；沒指定就隨機。
function showBubble(text, side = null) {
  reactionText.value = text;
  reactionSide.value = side || (Math.random() < 0.5 ? 'left' : 'right');
  // 對話泡泡正在同一邊的話，反應泡泡換到另一邊，不要疊在一起
  if (!showChat.value && showSpeech.value && speech.value && reactionSide.value === speechSide.value) {
    reactionSide.value = speechSide.value === 'left' ? 'right' : 'left';
  }
  showReaction.value = true;

  clearTimeout(reactionHideTimer);
  reactionHideTimer = setTimeout(() => {
    showReaction.value = false;
  }, 1800);
}

async function toggleLanguage() {
  const currentIndex = LANGUAGES.indexOf(language.value);
  language.value = LANGUAGES[(currentIndex + 1) % LANGUAGES.length];
  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uiLanguage: language.value }) // 只換介面，角色說話的語言不變
    });
  } catch {
    // 存語言偏好失敗也不擋使用者操作，頂多下次開啟要重新選一次。
  }
}

let healthPollTimer = null;
// 記錄「一開始有沒有成功拿到 profile/history」：如果連伺服器都連不上（不只是 fm 沒開），
// 復原的時候不能只是把警告藏起來，還要把當初漏掉的 profile/history 補抓回來，
// 不然畫面會一直停在空白的初始狀態。
let initialDataLoaded = false;

async function loadInitialData() {
  const [healthRes, profileRes] = await Promise.all([
    fetch('/api/health').then((r) => r.json()),
    fetch('/api/profile').then((r) => r.json())
  ]);

  const ui = profileRes?.uiLanguage || profileRes?.language;
  if (LANGUAGES.includes(ui)) language.value = ui;
  profile.value = { ...profile.value, ...profileRes };
  // 舊對話不再一打開就顯示（見上面「今天稍早的對話」），只算今天稍早有幾則給按鈕用。
  loadEarlierCount();
  initialDataLoaded = true;

  return healthRes;
}

// 使用者可能是在 Apple Intelligence 還沒準備好、或伺服器還在啟動時就先打開網頁，
// 這裡背景每隔一段時間偷偷檢查一次，狀況變好的話警告會自動消失、不用重新整理頁面，
// 恢復的時候也讓角色開心一下、跳個泡泡告訴使用者「連上了」。
function startHealthPolling() {
  if (healthPollTimer) return;
  healthPollTimer = setInterval(async () => {
    if (!fmWarningKey.value) {
      clearInterval(healthPollTimer);
      healthPollTimer = null;
      return;
    }
    try {
      // 如果一開始整個連不上伺服器，這裡順便把當初沒拿到的 profile/history 補回來；
      // 已經拿到過的話（只是 fm 本身沒開），就只需要重新檢查健康狀態即可。
      const healthRes = initialDataLoaded ? await fetch('/api/health').then((r) => r.json()) : await loadInitialData();
      if (healthRes?.fm?.available) {
        fmWarningKey.value = '';
        clearInterval(healthPollTimer);
        healthPollTimer = null;
        setStatus('HAPPY', { autoRestMs: 1500 });
        showBubble(t.value.backendRecovered);
      } else if (fmWarningKey.value === 'backendUnreachable') {
        // 伺服器連上了（loadInitialData 沒丟例外），但 fm 還沒準備好：
        // 把警告換成比較準確的訊息，繼續輪詢等 fm 好。
        fmWarningKey.value = 'fmUnavailable';
      }
    } catch {
      // 還是連不上，繼續等下一輪，不用特別處理。
    }
  }, 15000);
}

// ================= 進入畫面的流程：密碼 → 選角色 → 開始聊天 =================
// lockMode：null（沒鎖）| 'setup'（第一次，設定密碼）| 'unlock'（輸入密碼）
// 密碼後端見 server/lockService.js；角色見 server/characterService.js。
const lockMode = ref(null);
const pickerOpen = ref(false);
const characterId = ref(null); // 現在選的角色（同步到 api.js 的 session，每個請求都會帶）
let started = false; // 選過角色、開始聊天了嗎（閒置上鎖、切分頁問候都要等這個）

async function boot() {
  loadLimits();
  try {
    const res = await fetch('/api/lock/status');
    const { hasPin } = await res.json();
    lockMode.value = hasPin ? 'unlock' : 'setup';
  } catch {
    // 連不上伺服器：先顯示輸入密碼，按下去時 LockScreen 會說連不上
    lockMode.value = 'unlock';
  }
}

function onUnlocked(token) {
  session.token = token;
  lockMode.value = null;
  markActive();
  if (!characterId.value) {
    pickerOpen.value = true;
  } else if (!started) {
    startSession();
  } else {
    // 閒置上鎖後解鎖：回到原本的角色；順便更新可能在上鎖期間過期的資料
    loadCompanion();
    loadWeather();
  }
}

function openPicker() {
  settingsOpen.value = false;
  diaryOpen.value = false;
  memoryOpen.value = false;
  hourlyOpen.value = false;
  pickerOpen.value = true;
}

async function onSelectCharacter(c) {
  const changed = c.id !== characterId.value;
  pickerOpen.value = false;
  if (!changed && started) return;
  characterId.value = c.id;
  session.characterId = c.id;
  await startSession();
}

// 刪掉的剛好是現在這隻：清掉目前角色，選畫面裡點任何一隻都會重新開始
function onCharacterDeleted(id) {
  if (id !== characterId.value) return;
  characterId.value = null;
  session.characterId = null;
  started = false;
}

// 匯入備份完成：資料整個換掉了，回到選角色畫面重新開始
function onImported() {
  settingsOpen.value = false;
  characterId.value = null;
  session.characterId = null;
  started = false;
  resetSessionState();
  showToast(t.value.settings.importDone, 'ok');
  pickerOpen.value = true;
}

// 換角色時把上一個角色的畫面狀態清乾淨
function resetSessionState() {
  stopSpeaking();
  messages.value = [];
  earlierMessages.value = [];
  earlierCount.value = 0;
  earlierOpen.value = false;
  speech.value = null;
  fortunePopup.value = null;
  growth.value = null;
  events.value = [];
  fortuneToday.value = false;
  weather.value = null; // 城市跟著角色走，換角色要重新拿
  // 設定（語言、稱呼、喜好、紀念日、城市…）全部跟著角色走，換角色先清掉上一個角色的
  profile.value = { nickname: '', personaPrompt: '', preferences: [], anniversaries: [] };
  hourlyOpen.value = false;
  fmWarningKey.value = '';
  setMood(DEFAULT_MOOD);
  setAsleep(false);
  restToIdle();
  sessionStartedAt = Date.now();
  lastGreetRequestAt = 0;
}

async function startSession() {
  resetSessionState();
  if (!started) {
    started = true;
    weatherTimer = setInterval(loadWeather, 30 * 60 * 1000);
    quirks.start();
  }
  loadWeather();
  try {
    await loadCompanion();
    const healthRes = await loadInitialData();
    let greeted = false;
    if (!healthRes?.fm?.available) {
      fmWarningKey.value = 'fmUnavailable';
      startHealthPolling();
    } else {
      greeted = await requestGreeting();
    }
    // AI 沒辦法主動打招呼（fm 不可用、這個時段已經打過）時，用本機的固定招呼語。
    if (!greeted) maybeShowGreeting();
    maybeShowAnniversary();
  } catch (err) {
    fmWarningKey.value = 'backendUnreachable';
    startHealthPolling();
  }
}

// ---- 閒置 15 分鐘自動上鎖 ----
// 「有在用」＝點、按鍵、觸控，或角色正在聽／想／講話。上鎖時通知伺服器把 token 作廢。
const IDLE_LOCK_MS = 15 * 60 * 1000;
let lastActivityAt = Date.now();
function markActive() {
  lastActivityAt = Date.now();
}
for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
  window.addEventListener(ev, markActive, { passive: true });
}
watch(status, (s) => {
  if (['LISTENING', 'THINKING', 'SPEAKING'].includes(s)) markActive();
});
function lockNow() {
  if (lockMode.value) return;
  const token = session.token;
  session.token = null;
  if (token) {
    fetch('/api/lock/lock', { method: 'POST', headers: { 'X-PokkaTomo-Token': token } }).catch(() => {});
  }
  if (status.value === 'SPEAKING') stopSpeaking();
  settingsOpen.value = false;
  diaryOpen.value = false;
  memoryOpen.value = false;
  hourlyOpen.value = false;
  lockMode.value = 'unlock';
}
const idleTimer = setInterval(() => {
  if (!started || lockMode.value) return;
  if (['LISTENING', 'THINKING', 'SPEAKING'].includes(status.value)) return;
  if (Date.now() - lastActivityAt >= IDLE_LOCK_MS) lockNow();
}, 30 * 1000);
// 伺服器說 token 無效（伺服器重開、太久沒用）→ 蓋上密碼畫面
const offLocked = onLocked(() => {
  if (!lockMode.value) lockMode.value = 'unlock';
});

// ---- 文字對話顯示／隱藏（主要用語音；預設隱藏，這台瀏覽器會記住） ----
const SHOW_CHAT_KEY = 'pokkatomo.showChat';
function readShowChat() {
  try {
    return localStorage.getItem(SHOW_CHAT_KEY) === '1';
  } catch {
    return false;
  }
}
const showChat = ref(readShowChat());
function toggleChat() {
  showChat.value = !showChat.value;
  try {
    localStorage.setItem(SHOW_CHAT_KEY, showChat.value ? '1' : '0');
  } catch {
    /* noop */
  }
  if (showChat.value) scrollToBottom();
}

// ---- 漫畫對話泡泡：文字對話隱藏時，角色說的話從角色頭的左上／右上冒出來 ----
// 使用者自己說的話不再顯示一次（她自己知道說了什麼）。角色講完再停 4.5 秒淡出；
// 靜音時依字數決定停多久；出錯（有重送按鈕）的不自動消失。想的時候泡泡裡是「…」。
// 右上角 💭 可以關掉泡泡（只聽聲音），這台瀏覽器會記住。
const SHOW_SPEECH_KEY = 'pokkatomo.showSpeech';
function readShowSpeech() {
  try {
    return localStorage.getItem(SHOW_SPEECH_KEY) !== '0';
  } catch {
    return true;
  }
}
const showSpeech = ref(readShowSpeech());
function toggleSpeech() {
  showSpeech.value = !showSpeech.value;
  try {
    localStorage.setItem(SHOW_SPEECH_KEY, showSpeech.value ? '1' : '0');
  } catch {
    /* noop */
  }
}
// ---- 上方按鈕：功能類（天氣、占卜、記得的事、日記）／設定類（介面語言、聲音、泡泡、設定面板） ----
// 空間不夠時設定類收進一個 🎛️ 按鈕（按了在下面展開）。「夠不夠」用實際寬度量：
// 標題至少留 TITLE_MIN_PX＋功能類＋設定類全部攤開的寬度（.measure 那份看不到的複本）> 上方列寬度 → 收起來。
const settingButtons = computed(() => [
  { key: 'lang', cls: 'lang-toggle', icon: '🌐', text: t.value.label, label: t.value.switchLangLabel, onClick: toggleLanguage },
  {
    key: 'mute',
    cls: 'settings-btn',
    icon: muted.value ? '🔇' : '🔊',
    label: muted.value ? t.value.unmuteLabel : t.value.muteLabel,
    pressed: muted.value,
    onClick: toggleMute
  },
  // 對話泡泡開關（文字對話隱藏時，角色說的話用漫畫泡泡顯示在角色旁邊）
  ...(!showChat.value
    ? [
        {
          key: 'speech',
          cls: ['settings-btn', 'speech-btn', { off: !showSpeech.value }],
          icon: '💭',
          label: showSpeech.value ? t.value.speechBubbleHide : t.value.speechBubbleShow,
          pressed: showSpeech.value,
          onClick: toggleSpeech
        }
      ]
    : []),
  { key: 'settings', cls: 'settings-btn', icon: '⚙️', label: t.value.settingsButtonLabel, onClick: openSettings, closesMenu: true }
]);
const topRightEl = ref(null);
const featureGroupEl = ref(null);
const settingMeasureEl = ref(null);
const settingMenuEl = ref(null);
const settingsCollapsed = ref(false);
const settingMenuOpen = ref(false);
const TITLE_MIN_PX = 110;
function fitTopBar() {
  const bar = topRightEl.value?.parentElement;
  if (!bar || !featureGroupEl.value || !settingMeasureEl.value) return;
  const warning = topRightEl.value.querySelector('.warn-wrap');
  const gap = 8;
  const need =
    TITLE_MIN_PX +
    (warning ? warning.offsetWidth + gap : 0) +
    featureGroupEl.value.scrollWidth +
    gap +
    settingMeasureEl.value.scrollWidth +
    gap;
  const collapse = need > bar.clientWidth;
  if (collapse !== settingsCollapsed.value) {
    settingsCollapsed.value = collapse;
    settingMenuOpen.value = false;
  }
}
function onMenuButton(b) {
  b.onClick();
  if (b.closesMenu) settingMenuOpen.value = false;
}
let topBarObserver = null;
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    topBarObserver = new ResizeObserver(() => fitTopBar());
    if (topRightEl.value?.parentElement) topBarObserver.observe(topRightEl.value.parentElement);
    if (featureGroupEl.value) topBarObserver.observe(featureGroupEl.value);
    if (settingMeasureEl.value) topBarObserver.observe(settingMeasureEl.value);
  }
  window.addEventListener('resize', fitTopBar);
  nextTick(fitTopBar);
});
onUnmounted(() => {
  window.removeEventListener('resize', fitTopBar);
  topBarObserver?.disconnect();
});
// 天氣、警告出現或消失、語言切換（字變長短）→ 重新量
watch(() => [fmWarningKey.value, t.value.label, showChat.value], () => nextTick(fitTopBar));

const speech = ref(null);
const speechKey = ref(0);
const speechSide = ref('right');
const thinkingNow = computed(() => status.value === 'THINKING' || greetPending.value);
let speechTimer = null;
function scheduleSpeechHide(ms) {
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => (speech.value = null), ms);
}
watch(
  () => messages.value.length,
  (len, oldLen) => {
    if (len <= (oldLen || 0)) return;
    const m = messages.value[len - 1];
    clearTimeout(speechTimer);
    // 自己說的話、占卜（有自己的彈出視窗）不用泡泡
    if (m.role === 'user' || m.kind === 'fortune') {
      speech.value = null;
      return;
    }
    if (!speech.value) speechSide.value = Math.random() < 0.5 ? 'left' : 'right';
    speech.value = m;
    speechKey.value += 1;
    if (m.retryText) return;
    const readMs = Math.max(4500, String(m.content || '').length * 160);
    if (status.value !== 'SPEAKING') scheduleSpeechHide(readMs);
  }
);
watch(status, (s, prev) => {
  if (prev === 'SPEAKING' && s !== 'SPEAKING' && speech.value && !speech.value.retryText) scheduleSpeechHide(4500);
  if (s === 'SPEAKING') startSpeechAutoScroll();
  else stopSpeechAutoScroll();
});

// ---- 對話泡泡放不下時 ----
// 泡泡從額頭往上長，但角色上方的空間依視窗比例差很多（寬又矮的螢幕上方幾乎沒空間，
// 以前長的話直接衝出畫面頂端）。這裡量實際剩下的空間：
//   - 上方空間夠 → 照舊放在頭的左上／右上，內容高度最多到頭頂區下緣；
//   - 上方太擠、但角色左右有空間（寬螢幕）→ 改放在角色旁邊（頭的高度，往下長），尾巴指向頭；
//   - 都很擠 → 還是放上方，內容在泡泡裡捲動。
// 內容一定不會超出畫面；放不下的部分在泡泡裡捲動，唸的時候會自動跟著捲。
const stageEl = ref(null);
const anchorEl = ref(null);
const speechBodyEl = ref(null);
const speechFit = ref({ beside: false, style: {}, bodyMax: 190 });
const BUBBLE_CHROME = 30; // 泡泡上下 padding＋框線
const TAIL = 16;
// 下面還有字 → 泡泡底部淡出，提示可以往下滑（唸的時候也會自己捲）
const speechHasMore = ref(false);
function updateSpeechMore() {
  const el = speechBodyEl.value;
  speechHasMore.value = !!el && el.scrollHeight - el.clientHeight - el.scrollTop > 4;
}
function fitSpeechBubble() {
  nextTick(updateSpeechMore);
  const stage = stageEl.value?.getBoundingClientRect();
  const anchor = anchorEl.value?.getBoundingClientRect();
  if (!stage || !anchor || !anchor.height) return;
  const topLimit = Math.max(stage.top, document.querySelector('.top-bar')?.getBoundingClientRect().bottom || 0) + 6;
  const bubbleBottom = anchor.top + anchor.height * 0.24; // 對應 CSS 的 bottom: 76%
  const above = bubbleBottom - TAIL - topLimit - BUBBLE_CHROME;
  const vw = document.documentElement.clientWidth;
  const side = (vw - anchor.width) / 2 - 20; // 角色左右兩側各剩多少寬
  if (above >= 110 || side < 190) {
    speechFit.value = { beside: false, style: {}, bodyMax: Math.max(48, Math.min(Math.floor(above), 320)) };
    return;
  }
  // 放旁邊：泡泡上緣在頭頂附近，往下長到角色區底部為止
  const top = Math.max(topLimit, anchor.top + anchor.height * 0.02);
  const bottomLimit = stage.bottom - 8;
  speechFit.value = {
    beside: true,
    style: { top: `${Math.round(top - anchor.top)}px`, maxWidth: `${Math.round(Math.min(side, 340))}px` },
    bodyMax: Math.max(60, Math.floor(Math.min(bottomLimit - top - BUBBLE_CHROME, 360)))
  };
}
watch([speech, showSpeech, showChat], () => nextTick(fitSpeechBubble));
onMounted(() => {
  window.addEventListener('resize', fitSpeechBubble);
  // thinkingNow 用到後面才宣告的 greetPending，所以等掛載後再開始看
  watch(thinkingNow, () => nextTick(fitSpeechBubble));
});
onUnmounted(() => window.removeEventListener('resize', fitSpeechBubble));

// 唸的時候跟著捲：瀏覽器有回報唸到哪（boundary 事件）就照那個位置捲，
// 沒有的話用估計的時間慢慢捲。使用者自己滑了泡泡就不再自動捲。
const speechUserScrolled = ref(false);
let speechProgressSeen = false;
let speechScrollTimer = null;
function scrollSpeechTo(ratio) {
  const el = speechBodyEl.value;
  if (!el || speechUserScrolled.value) return;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  // 讓正在唸的那一行留在泡泡的上半部
  const target = Math.min(max, Math.max(0, ratio * el.scrollHeight - el.clientHeight * 0.35));
  el.scrollTo({ top: target, behavior: 'smooth' });
}
function onSpeechProgress(ratio) {
  speechProgressSeen = true;
  scrollSpeechTo(ratio);
}
function startSpeechAutoScroll() {
  stopSpeechAutoScroll();
  speechUserScrolled.value = false;
  speechProgressSeen = false;
  const text = String(speech.value?.content || '');
  const rate = voiceOptions().rate || 1;
  const estMs = Math.max(1500, (text.length * 230) / Math.max(rate, 0.5));
  const started = Date.now();
  speechScrollTimer = setInterval(() => {
    if (speechProgressSeen) return; // 有真的進度就用真的
    scrollSpeechTo(Math.min(1, (Date.now() - started) / estMs));
  }, 400);
}
function stopSpeechAutoScroll() {
  clearInterval(speechScrollTimer);
  speechScrollTimer = null;
}
watch(speechKey, () => {
  speechUserScrolled.value = false;
});

// ---- 今日占卜的彈出視窗（蓋在角色上面，✕ 或 Esc 關閉） ----
const fortunePopup = ref(null);

onMounted(boot);

document.addEventListener('visibilitychange', onVisibilityChange);

// 主動問候（server/greetService.js）：一天四個時段，每個時段 PokkaTomo 最多主動開口一次，
// 由伺服器決定這次要不要講（多開分頁、重新整理都不會重複）。回傳 true 代表這次有講話。
let lastGreetRequestAt = 0;
const GREET_MIN_INTERVAL_MS = 10 * 60 * 1000;
// 主動問候要等模型想幾秒：超過 0.4 秒還沒好，就先顯示「…」讓人知道牠正要開口
// （不用 THINKING 狀態，因為那會鎖住麥克風——使用者想先講話也可以）。很快就回來（這個時段已經打過招呼）的話不會閃一下。
const greetPending = ref(false);
async function requestGreeting({ speakIt = false } = {}) {
  lastGreetRequestAt = Date.now();
  const pendingTimer = setTimeout(() => {
    greetPending.value = true;
    scrollToBottom();
  }, 400);
  try {
    const res = await fetch('/api/greet', { method: 'POST' });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.greeting) return false;
    messages.value.push({ role: 'assistant', content: data.greeting });
    await scrollToBottom();
    setMood(data.missedDays ? 'love' : data.mood);
    // 好幾天沒見 → 撒嬌的表情；出門回來 → 歡迎回家
    if (data.missedDays) showBubble('🥺💕');
    else if (data.welcomeBack) showBubble('🏠✨');
    if (speakIt && !muted.value && status.value !== 'THINKING' && status.value !== 'SPEAKING') {
      setStatus('SPEAKING');
      speak(data.greeting, { ...voiceOptions(), onEnd: () => setStatus('HAPPY', { autoRestMs: 900 }) });
    } else {
      setStatus('HAPPY', { autoRestMs: 1500 });
    }
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(pendingTimer);
    greetPending.value = false;
  }
}

// 離開一陣子再切回這個分頁（例如早上開著、晚上回來）：問伺服器現在這個時段要不要打招呼。
// 前端自己再擋一層「10 分鐘內不重複問」，免得頻繁切分頁一直打 API。
function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (!started || lockMode.value || pickerOpen.value) return;
  if (fmWarningKey.value || isSending.value) return;
  if (Date.now() - lastGreetRequestAt < GREET_MIN_INTERVAL_MS) return;
  requestGreeting({ speakIt: userHasInteracted });
}

// 完全沒有聊天紀錄（第一次打開，或清空過歷史）時，主動打一句招呼，
// 順便暗示「按住麥克風」跟「⌨️打字」這兩種操作方式，取代額外的教學畫面或空白畫面。
// 這句招呼只存在畫面上、不會送到 /api/chat、也不會寫進對話紀錄。
function maybeShowGreeting() {
  if (messages.value.length > 0) return;
  // 第一次見面：自我介紹＋教怎麼用；之後（以前聊過）就只是打聲招呼
  const greeting = profile.value.firstMetAt
    ? pickFrom(t.value.greetingReturn)
    : isNight.value
      ? t.value.greetingNight
      : t.value.greetingDay;
  messages.value.push({ role: 'assistant', content: greeting });
  setStatus('HAPPY', { autoRestMs: 1500 });
}

// 紀念日當天或快到了（3 天內），一打開網頁 PokkaTomo 就主動提起——不用等 AI 剛好想到。
// 同一天只提一次（記在 localStorage），不然每次重新整理都講一次會很煩。只顯示在畫面上，
// 不寫進聊天紀錄。紀念日是「每年同一天」，所以只比月/日，年份拿來算「第幾年」。
// 紀念日跟著角色走，「今天提過了」也每個角色分開記
const annivShownKey = () => `pokkatomo.anniversaryShownOn.${characterId.value || 'default'}`;
const ANNIV_SOON_DAYS = 3;

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function findUpcomingAnniversary(anniversaries, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best = null;
  for (const a of anniversaries || []) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a?.date || '');
    if (!m || !a.name) continue;
    const [, y, mo, d] = m.map(Number);
    let next = new Date(today.getFullYear(), mo - 1, d);
    if (next < today) next = new Date(today.getFullYear() + 1, mo - 1, d);
    const days = Math.round((next - today) / 86400000);
    if (days > ANNIV_SOON_DAYS) continue;
    // noYear：只知道月日（不知道哪一年開始）→ 不說「第幾年」
    if (!best || days < best.days) best = { name: a.name, days, years: a.noYear ? 0 : next.getFullYear() - y };
  }
  return best;
}

function maybeShowAnniversary() {
  const todayKey = localDateKey(new Date());
  try {
    if (localStorage.getItem(annivShownKey()) === todayKey) return;
  } catch {
    /* 讀不到就照樣顯示 */
  }
  const hit = findUpcomingAnniversary(profile.value.anniversaries);
  if (!hit) return;
  const text = hit.days === 0 ? t.value.anniversaryToday(hit.name, hit.years) : t.value.anniversarySoon(hit.name, hit.days);
  messages.value.push({ role: 'assistant', content: text });
  scrollToBottom();
  setStatus('HAPPY', { autoRestMs: 2500 });
  showBubble(hit.days === 0 ? '🎉' : '📅');
  try {
    localStorage.setItem(annivShownKey(), todayKey);
  } catch {
    /* noop */
  }
}

function onAvatarHover() {
  if (status.value === 'IDLE') setStatus('HAPPY', { autoRestMs: 1200 });
}

// 過了午夜、跨到新的一天（例如一直開著網頁到隔天）：重新拿一次節日、睡覺狀態、占卜狀態。
let companionTimer = setInterval(() => {
  if (started && !lockMode.value) loadCompanion();
}, 10 * 60 * 1000);

// 小動作、說夢話、被戳頭暈、睡著時被戳（見 composables/useQuirks.js）
const quirks = useQuirks({
  status,
  strings: () => t.value,
  level: () => level.value,
  profile: () => profile.value,
  canAct: () => started && !lockMode.value && !pickerOpen.value && !settingsOpen.value && !diaryOpen.value && !memoryOpen.value && !isSending.value,
  showBubble: (text) => showBubble(text),
  onWake: () => {
    setAsleep(false);
    setStatus('HAPPY', { autoRestMs: 1500 });
    fetch('/api/companion/wake', { method: 'POST' }).catch(() => {});
  }
});
const quirk = quirks.quirk;

// 點角色的一般反應台詞：親密度越高，解鎖越多。
const reactionPool = computed(() => [
  ...t.value.reactions,
  ...(level.value >= 3 ? t.value.reactionsLv3 : []),
  ...(level.value >= 5 ? t.value.reactionsLv5 : [])
]);

// 摸不同部位 → 不同台詞＋不同小動作（部位名稱見 avatarParts.js）。
// 摸頭另外加上親密度解鎖的台詞（最像「摸摸頭」的互動）；沒有專屬台詞的部位用一般反應。
// 全身角色才有的部位（手、腳、尾巴）：揮手、跳一下、搖尾巴。舊版角色沒有這些動畫就只跳台詞。
const PART_QUIRK = { cheek: 'blush', ear: 'earwiggle', belly: 'giggle', hand: 'wave', foot: 'hop', tail: 'tailwag' };
function reactionFor(part) {
  const lines = t.value.partReactions?.[part];
  if (!lines?.length) return pickFrom(reactionPool.value);
  if (part === 'head') {
    return pickFrom([
      ...lines,
      ...(level.value >= 3 ? t.value.reactionsLv3 : []),
      ...(level.value >= 5 ? t.value.reactionsLv5 : [])
    ]);
  }
  return pickFrom(lines);
}

function onAvatarTouch({ part = 'body', side = null } = {}) {
  userHasInteracted = true;
  // 講話講到一半點角色 = 「好了好了我知道了」：直接讓牠停下來。以前講話期間麥克風按鈕
  // 是 disabled，回覆一長就只能乾等最多 20 秒才能說下一句。
  if (status.value === 'SPEAKING') {
    stopSpeaking(); // 會觸發 speak() 的 onEnd，狀態照常回到 HAPPY → IDLE
    return;
  }
  // 睡著時被戳（嘟囔、戳三下才醒）、短時間連戳五下（頭暈）由 useQuirks 接手
  if (quirks.handleTap()) return;
  setStatus('HAPPY', { autoRestMs: 1500 });
  if (PART_QUIRK[part]) quirks.playQuirk(PART_QUIRK[part], { line: false });
  showBubble(reactionFor(part), side);
  sendPat(part);
}

onUnmounted(() => {
  clearTimeout(reactionHideTimer);
  clearInterval(weatherTimer);
  document.removeEventListener('pointerdown', onDocPointerDown);
  document.removeEventListener('keydown', onDocKeydown);
  clearInterval(companionTimer);
  clearTimeout(moodDecayTimer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (healthPollTimer) clearInterval(healthPollTimer);
  clearInterval(idleTimer);
  clearTimeout(speechTimer);
  offLocked();
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) window.removeEventListener(ev, markActive);
});

function onStartListening() {
  setStatus('LISTENING');
}

function onStopListening() {
  // 如果沒有辨識出結果就放開了，回到平常狀態。
  if (status.value === 'LISTENING') restToIdle();
}

// 語音辨識失敗的原因（麥克風權限被拒絕、沒聽到聲音、其他錯誤）之前完全沒有回饋，
// 使用者只會看到按鈕放開後什麼都沒發生。現在依錯誤代碼挑一句對應的提示，
// 用跟點角色/聊天出錯同一套反應泡泡顯示出來，並確保狀態回到平常。
function onVoiceError(code) {
  if (status.value === 'LISTENING') restToIdle();
  let msgKey = 'micGenericError';
  if (code === 'not-allowed' || code === 'permission-denied' || code === 'service-not-allowed') {
    msgKey = 'micDenied';
  } else if (code === 'no-speech') {
    msgKey = 'micNoSpeech';
  }
  showBubble(t.value[msgKey]);
  reportClient('speech_error', code, 'warn');
}

const showSlowHint = ref(false);
// 防止「重新傳送」被連續點很多下，或跟一則還在處理中的訊息重疊送出：
// 這兩個請求都會各自去讀取-修改-寫回 對話檔／user.json，
// 同時送出的話後寫入的那個會蓋掉先寫入的內容（lost update），聊天紀錄可能憑空少一段，
// AI 回覆也可能不照順序出現、TTS 疊在一起講。用一個簡單的旗標擋掉，比在後端做檔案鎖簡單很多。
const isSending = ref(false);

// 按了「重新傳送」之後，把那一則失敗訊息上的按鈕拿掉——以前重送成功後舊的按鈕還留著，
// 畫面上一直掛著「重新傳送」，使用者會以為還沒送成功、又按一次，同一句話送兩遍。
// 如果這次重送又失敗，會照常產生一則新的失敗訊息（帶新的重送按鈕）。
function retryMessage(m) {
  if (isSending.value || !m.retryText) return;
  const text = m.retryText;
  m.retryText = null;
  onVoiceResult(text);
}

async function onVoiceResult(text) {
  if (!text || isSending.value) return;
  userHasInteracted = true;
  isSending.value = true;
  setAsleep(false); // 跟牠說話就會醒來（後端也會同步清掉睡覺狀態）
  messages.value.push({ role: 'user', content: text });
  await scrollToBottom();
  setStatus('THINKING');

  // AI 在本機模型上可能要想個幾秒，先不要讓畫面看起來像凍住了：
  // 一開始顯示跳動的「…」，如果真的想比較久，換成一句「還在想」的提示文字。
  showSlowHint.value = false;
  const slowHintTimer = setTimeout(() => {
    showSlowHint.value = true;
  }, 6000);

  function stopThinkingIndicators() {
    clearTimeout(slowHintTimer);
    showSlowHint.value = false;
  }

  // 後端錯誤回應是 { error: <語言無關的代碼>, message: <寫死的中文說明> }（見
  // server/lib/errorHandler.js）——message 是給開發者在伺服器 log 看的，不能直接
  // 顯示在畫面上：介面語言切成日文時，使用者會在日文對話裡看到一句中文，
  // 這對日文母語的使用者來說是個大問題。這裡改成只認 error 代碼，
  // 對應到 i18n 裡已經翻好的文字，代碼不認得的話（意外的伺服器錯誤等）就用最籠統的
  // errFallback，不管哪種情況都不會把後端傳來的中文原文秀出來。
  function localizeChatError(errorCode) {
    if (errorCode === 'bad_request') return t.value.errMessageTooLong;
    if (errorCode === 'fm_unavailable') return t.value.fmUnavailable;
    return t.value.errFallback;
  }

  function failWith(errMsg) {
    stopThinkingIndicators();
    // 錯誤訊息留在聊天紀錄裡（可以重新傳送），同時讓角色跳個泡泡表示「我知道剛剛怪怪的」，
    // 而不是安安靜靜地回到 IDLE，好像什麼事都沒發生一樣。
    messages.value.push({ role: 'assistant', content: errMsg, retryText: text });
    showBubble(pickFrom(t.value.errorReactions));
    restToIdle();
  }

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();

    if (!res.ok) {
      // 開發時想看後端原本寫了什麼中文說明，看瀏覽器 console 就好，畫面上一律顯示
      // 翻譯過的版本（見 localizeChatError 的說明）。
      console.warn('[chat] 伺服器回應錯誤：', data?.error, data?.message);
      failWith(localizeChatError(data?.error));
      reportClient('chat_failed', `${res.status} ${data?.error || ''}`, 'warn');
      return;
    }

    stopThinkingIndicators();
    messages.value.push({ role: 'assistant', content: data.reply });
    await scrollToBottom();
    setMood(data.mood);
    applyGrowth(data.growth, data.levelUp);

    // 生活儀式（server/lib/rituals.js）：出門揮手、回家開心；晚安 → 講完之後真的去睡覺
    if (data.ritual === 'leaving') showBubble('👋');
    else if (data.ritual === 'home') showBubble('🏠💕');
    else if (data.ritual === 'morning') showBubble('☀️');
    const afterSpeaking = () => {
      if (data.ritual === 'goodnight') {
        setAsleep(true);
        restToIdle();
        showBubble('🌙');
      } else if (reactionQuirkFor(text)) {
        // 聊到吃的就吃一口點心、聊到音樂就跳一段（全身角色才有動畫）
        restToIdle();
        quirks.playQuirk(reactionQuirkFor(text), { line: false });
      } else {
        setStatus('HAPPY', { autoRestMs: 900 });
      }
    };

    if (muted.value) {
      afterSpeaking();
      return;
    }
    setStatus('SPEAKING');
    speak(data.reply, { ...voiceOptions(), onEnd: afterSpeaking });
  } catch (err) {
    failWith(t.value.errNetwork);
    reportClient('chat_network_error', err?.message || '', 'warn');
  } finally {
    // 不管成功、失敗還是丟例外，這一輪請求都已經結束（有沒有講完語音是另一回事，
    // 由 status 的 SPEAKING/disabled 邏輯負責），可以再送下一則了。
    isSending.value = false;
  }
}

async function scrollToBottom() {
  await nextTick();
  if (chatLogEl.value) {
    chatLogEl.value.scrollTop = chatLogEl.value.scrollHeight;
  }
}
</script>
