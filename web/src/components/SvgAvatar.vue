<!--
  SvgAvatar.vue — 舊版（第一代）角色：極簡向量 SVG、圓滾滾的 Q 版。設定裡選「圓圓的（舊版）」時使用；
  預設的全身角色是 FullBodyAvatar.vue。

  只依賴 `status` prop 做出：
    - 浮動（呼吸感）動畫：一直在跑
    - 眨眼動畫：IDLE / HAPPY / SLEEPY 時偶爾眨一下（SLEEPY 眨比較慢、眼睛半閉）
    - 口型切換：SPEAKING 時嘴巴一開一合，其他狀態嘴型依情緒而定
    - LISTENING：耳朵/臉頰亮起提示正在聽
    - THINKING：頭上出現「...」泡泡
    - mood（情緒）：胸口的「心情燈」依情緒變色、慢慢呼吸閃爍（講話時閃比較快）；
      sad / worried / surprised 另外有對應的眉毛跟嘴型。這是參考 ポケとも 用肚子燈光
      表達情緒的概念，角色造型本身是這個專案自己的原創設計。
    - ASLEEP：說晚安之後真的睡著——眼睛閉起來、頭上冒 Zzz、浮動變很慢
    - quirk（小動作，約 1.5 秒）：sneeze 打噴嚏 / yawn 打呵欠 / hiccup 打嗝 / hum 哼歌 /
      lookaround 東張西望 / dizzy 被戳到頭暈 / toot 噗（參考 NICOBO 的「不完美才可愛」）
    - accessory（節日配件）：santa 聖誕帽 / witch 萬聖節帽子 / sakura 櫻花髮夾

  點擊判斷（見 web/src/avatarParts.js）：
    畫面上看得到的形狀都不接收滑鼠事件；最上層另外疊一組透明的「感應區」（.hit），每一塊標著
    data-part（head 頭頂、face 臉、cheek 臉頰、ear 耳朵、belly 肚子的心情燈、body 身體其他地方），
    只有點到這些感應區才算摸到角色——點角色旁邊的空白處不會有反應。感應區放在 .float-group 裡，
    會跟著角色一起浮動。點到時發出 touch 事件 { part, side }，要有什麼反應由 App.vue 決定。
    鍵盤：角色可以 Tab 到，按 Enter／空白鍵等於摸頭。
-->
<template>
  <svg
    viewBox="0 0 200 200"
    class="svg-avatar"
    :class="[statusClass, `mood-${mood}`, quirk ? `quirk-${quirk}` : '']"
    :style="{ '--mood-color': moodColorValue, ...paletteStyle(palette) }"
    role="button"
    tabindex="0"
    :aria-label="label"
    @click="onClick"
    @pointerover="onPointerOver"
    @pointerout="onPointerOut"
    @keydown.enter.prevent="emitTouch('head', null)"
    @keydown.space.prevent="emitTouch('head', null)"
  >
    <g class="quirk-group">
    <g class="float-group">
      <!-- 身體 -->
      <ellipse cx="100" cy="120" rx="62" ry="58" class="body" />
      <!-- 耳朵 -->
      <circle cx="52" cy="58" r="20" class="ear" :class="{ 'ear-glow': status === 'LISTENING' }" />
      <circle cx="148" cy="58" r="20" class="ear" :class="{ 'ear-glow': status === 'LISTENING' }" />

      <!-- 節日配件（戴在頭上） -->
      <g v-if="accessory === 'santa'" class="acc">
        <path d="M66 72 C70 36 108 18 144 30 L132 70 Z" fill="#e53935" />
        <circle cx="146" cy="30" r="8" fill="#ffffff" />
        <rect x="60" y="64" width="80" height="13" rx="6.5" fill="#ffffff" />
      </g>
      <g v-else-if="accessory === 'witch'" class="acc">
        <ellipse cx="100" cy="70" rx="50" ry="9" fill="#4a2f73" />
        <path d="M76 68 L108 10 L124 68 Z" fill="#6a45a3" />
        <rect x="78" y="58" width="44" height="8" fill="#ffb74d" />
      </g>
      <g v-else-if="accessory === 'sakura'" class="acc sakura-clip">
        <circle v-for="a in [0, 72, 144, 216, 288]" :key="a" :cx="140 + 7 * Math.cos((a * Math.PI) / 180)"
          :cy="76 + 7 * Math.sin((a * Math.PI) / 180)" r="5.5" fill="#ffb7d0" />
        <circle cx="140" cy="76" r="3" fill="#ff7aa8" />
      </g>

      <!-- 臉頰紅暈：HAPPY 時明顯一點 -->
      <ellipse cx="68" cy="128" rx="12" ry="8" class="cheek" />
      <ellipse cx="132" cy="128" rx="12" ry="8" class="cheek" />

      <!-- 眼睛：用一個會被 CSS 動畫壓扁的 group 模擬眨眼 -->
      <g v-if="eyeStyle === 'closed'" class="closed-eyes">
        <path d="M70 112 Q80 120 90 112" />
        <path d="M110 112 Q120 120 130 112" />
      </g>
      <g v-else-if="eyeStyle === 'dizzy'" class="dizzy-eyes">
        <circle cx="80" cy="112" r="8" /><circle cx="80" cy="112" r="3.5" />
        <circle cx="120" cy="112" r="8" /><circle cx="120" cy="112" r="3.5" />
      </g>
      <g v-else class="eyes">
        <ellipse cx="80" cy="112" rx="9" ry="11" class="eye" />
        <ellipse cx="120" cy="112" rx="9" ry="11" class="eye" />
        <!-- SLEEPY 專用：半閉眼蓋 -->
        <path v-if="status === 'SLEEPY'" d="M69 108 Q80 116 91 108" class="sleepy-lid" />
        <path v-if="status === 'SLEEPY'" d="M109 108 Q120 116 131 108" class="sleepy-lid" />
      </g>

      <!-- 眉毛：只有難過／擔心的時候出現（內側往上抬，看起來眉頭皺起來） -->
      <g v-if="showMoodFace && (mood === 'sad' || mood === 'worried')" class="brows">
        <path d="M70 96 Q78 92 88 97" />
        <path d="M112 97 Q122 92 130 96" />
      </g>

      <!-- 心情燈：情緒的顏色 -->
      <ellipse cx="100" cy="166" rx="15" ry="6.5" class="mood-light" />

      <!-- 嘴巴：依狀態切換不同形狀，SPEAKING 用 CSS keyframe 開合 -->
      <path :d="mouthPath" class="mouth" :class="{ 'mouth-talking': status === 'SPEAKING' }" />

      <!-- 感應區（透明、疊在最上面）：後面的蓋過前面的，所以小的部位放在後面 -->
      <g class="hit">
        <ellipse data-part="body" cx="100" cy="120" rx="62" ry="58" />
        <ellipse data-part="head" cx="100" cy="80" rx="52" ry="22" />
        <path v-if="accessory === 'santa' || accessory === 'witch'" data-part="head" d="M62 76 L100 8 L150 26 L140 76 Z" />
        <ellipse data-part="face" cx="100" cy="124" rx="34" ry="30" />
        <circle data-part="cheek" data-side="left" cx="68" cy="128" r="14" />
        <circle data-part="cheek" data-side="right" cx="132" cy="128" r="14" />
        <ellipse data-part="belly" cx="100" cy="166" rx="26" ry="11" />
        <circle data-part="ear" data-side="left" cx="52" cy="58" r="21" />
        <circle data-part="ear" data-side="right" cx="148" cy="58" r="21" />
      </g>
    </g>
    </g>

    <!-- 睡著：Zzz -->
    <g v-if="status === 'ASLEEP'" class="zzz">
      <text x="140" y="52">z</text>
      <text x="152" y="38">z</text>
      <text x="166" y="22">Z</text>
    </g>
    <!-- 哼歌：音符 -->
    <g v-if="quirk === 'hum'" class="notes">
      <text x="146" y="60">♪</text>
      <text x="162" y="40">♫</text>
    </g>
    <!-- 噗：一小團雲 -->
    <g v-if="quirk === 'toot'" class="puff">
      <circle cx="44" cy="176" r="7" /><circle cx="34" cy="170" r="5" /><circle cx="28" cy="180" r="4" />
    </g>

    <!-- THINKING 泡泡 -->
    <g v-if="status === 'THINKING'" class="think-bubble">
      <circle cx="150" cy="46" r="5" />
      <circle cx="164" cy="34" r="4" />
      <circle cx="176" cy="22" r="3.2" />
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue';
import { moodColor } from '../moods.js';
import { eyeStyleFor, mouthFor, showsMoodFace } from '../avatarFaces.js';
import { useAvatarHit } from '../composables/useAvatarHit.js';
import { paletteStyle } from '../palettes.js';

const emit = defineEmits(['touch', 'hover']);

// 點擊／滑過判斷（只算感應區）兩隻角色共用，見 composables/useAvatarHit.js
const { onClick, onPointerOver, onPointerOut, emitTouch } = useAvatarHit(emit);

const props = defineProps({
  status: {
    type: String,
    default: 'IDLE'
  },
  mood: {
    type: String,
    default: 'calm'
  },
  label: { type: String, default: 'PokkaTomo' },
  quirk: { type: String, default: null },
  accessory: { type: String, default: null },
  palette: { type: String, default: 'peach' }
});

// 表情規則兩隻角色共用（見 web/src/avatarFaces.js）
const eyeStyle = computed(() => eyeStyleFor(props.status, props.quirk));
const statusClass = computed(() => `status-${props.status.toLowerCase()}`);
// 情緒 → 燈光顏色（顏色定義在 web/src/moods.js，跟日記面板共用）。
const moodColorValue = computed(() => moodColor(props.mood));
const showMoodFace = computed(() => showsMoodFace(props.status));
const mouthPath = computed(() => mouthFor(props.status, props.mood, props.quirk));
</script>

<style scoped>
.svg-avatar {
  width: 100%;
  height: 100%;
  overflow: visible;
  /* 整個 SVG（包含看得到的形狀、空白處）都不接收點擊，只有下面的感應區接收 */
  pointer-events: none;
  outline: none;
}
.svg-avatar:focus-visible {
  outline: 3px solid #ff7a59;
  outline-offset: 4px;
  border-radius: 50%;
}
.hit * {
  fill: transparent;
  pointer-events: all;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.float-group {
  animation: float 3.2s ease-in-out infinite;
  transform-origin: 100px 120px;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.body { fill: var(--pal-mid, #ffd7a3); transition: fill 0.8s ease; }
.ear { fill: var(--pal-mid, #ffd7a3); transition: fill 0.8s ease, filter 0.3s ease; }
.ear-glow { filter: drop-shadow(0 0 6px #ffb25a); }
.cheek { fill: #ff9d80; opacity: 0.55; }

.eye { fill: #3a2b22; transform-origin: center; animation: blink 4.6s ease-in-out infinite; }
.eye:nth-of-type(2) { animation-delay: 0.05s; }
@keyframes blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.08); }
}

.sleepy-lid { fill: none; stroke: #3a2b22; stroke-width: 3; stroke-linecap: round; }

.mouth { fill: none; stroke: #a5502f; stroke-width: 4; stroke-linecap: round; transform-origin: 100px 142px; }
.mouth-talking { animation: talk 0.32s ease-in-out infinite; fill: #a5502f; }
@keyframes talk {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1.15); }
}

.think-bubble circle { fill: #ffffffcc; }

.brows path { fill: none; stroke: #3a2b22; stroke-width: 2.5; stroke-linecap: round; }

/* 心情燈：平常慢慢呼吸，講話時閃快一點；睡覺時調暗。 */
.mood-light {
  fill: var(--mood-color);
  filter: drop-shadow(0 0 6px var(--mood-color));
  transition: fill 0.6s ease, filter 0.6s ease;
  animation: mood-breathe 3s ease-in-out infinite;
}
@keyframes mood-breathe {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
.status-speaking .mood-light { animation-duration: 0.9s; }
.status-sleepy .mood-light { opacity: 0.25; animation: none; }

.closed-eyes path,
.dizzy-eyes circle {
  fill: none;
  stroke: #3a2b22;
  stroke-width: 3;
  stroke-linecap: round;
}
.dizzy-eyes circle {
  stroke-width: 2.2;
}

.status-asleep .float-group { animation-duration: 6s; }
.status-asleep .mood-light { opacity: 0.2; animation: none; }
.status-asleep .body,
.status-asleep .ear { fill: #d9c7f0; }

.zzz text,
.notes text {
  font-size: 16px;
  font-weight: 700;
  fill: #8a7bb8;
  animation: float-up 3s ease-in-out infinite;
}
.zzz text:nth-child(2) { animation-delay: 0.6s; font-size: 20px; }
.zzz text:nth-child(3) { animation-delay: 1.2s; font-size: 24px; }
.notes text { fill: #ff7a59; font-size: 20px; animation-duration: 1.4s; }
.notes text:nth-child(2) { animation-delay: 0.4s; }
@keyframes float-up {
  0% { opacity: 0; transform: translateY(6px); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-10px); }
}

.puff circle { fill: #e8dccb; animation: puff 1.4s ease-out forwards; }
@keyframes puff {
  0% { opacity: 0.9; transform: scale(0.4); transform-origin: 40px 176px; }
  100% { opacity: 0; transform: scale(1.4); transform-origin: 40px 176px; }
}

/* 小動作：套在最外層的 .quirk-group，跟一直在跑的浮動（.float-group）互不干擾 */
.quirk-group { transform-origin: 100px 170px; }
.quirk-sneeze .quirk-group { animation: q-sneeze 0.6s ease-out 1; }
.quirk-hiccup .quirk-group { animation: q-hiccup 0.5s ease-out 2; }
.quirk-yawn .quirk-group { animation: q-yawn 1.4s ease-in-out 1; }
.quirk-hum .quirk-group { animation: q-sway 0.7s ease-in-out 2; }
.quirk-lookaround .quirk-group { animation: q-look 1.4s ease-in-out 1; }
.quirk-dizzy .quirk-group { animation: q-dizzy 0.45s linear 3; }
.quirk-toot .quirk-group { animation: q-hiccup 0.4s ease-out 1; }
.quirk-toot .cheek { opacity: 0.95; }
@keyframes q-sneeze {
  0% { transform: none; }
  30% { transform: translateY(3px) scale(1.03, 0.95); }
  55% { transform: translateY(-6px) rotate(-4deg); }
  100% { transform: none; }
}
@keyframes q-hiccup {
  0%, 100% { transform: none; }
  40% { transform: translateY(-8px); }
}
@keyframes q-yawn {
  0%, 100% { transform: none; }
  50% { transform: scale(0.97, 1.05); }
}
@keyframes q-sway {
  0%, 100% { transform: rotate(0); }
  50% { transform: rotate(4deg); }
}
@keyframes q-look {
  0%, 100% { transform: rotate(0); }
  30% { transform: rotate(-6deg); }
  70% { transform: rotate(6deg); }
}
@keyframes q-dizzy {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-7deg); }
  75% { transform: rotate(7deg); }
}

/* 摸不同部位的小反應 */
.quirk-blush .cheek { opacity: 1; fill: #ff7aa0; transition: opacity 0.2s, fill 0.2s; }
.quirk-earwiggle .ear { transform-box: fill-box; transform-origin: center bottom; animation: q-ear 0.25s ease-in-out 4; }
.quirk-giggle .quirk-group { animation: q-giggle 0.18s ease-in-out 6; }
@keyframes q-ear {
  0%, 100% { transform: rotate(0); }
  50% { transform: rotate(10deg); }
}
@keyframes q-giggle {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(3px); }
}

@media (prefers-reduced-motion: reduce) {
  .quirk-group, .zzz text, .notes text, .float-group { animation: none !important; }
}

.mood-sad .float-group { animation-duration: 4.5s; }

/* 狀態專屬的整體色調微調 */

.status-sleepy .body,
.status-sleepy .ear { fill: #d9c7f0; }
.status-sleepy .float-group { animation-duration: 5.5s; }

.status-thinking .float-group { animation-duration: 2s; }
</style>
