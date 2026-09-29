<!--
  LockScreen.vue — 四位數密碼的蓋板（整個畫面蓋住，後面什麼都看不到）。
    mode = 'setup'：第一次，輸入兩次設定密碼（POST /api/lock/setup）
    mode = 'unlock'：輸入密碼（POST /api/lock/unlock）
  成功就 emit('unlocked', token)。密碼錯、輸錯太多次、連不上都在這裡顯示。
  可以點畫面上的數字鍵，也可以直接用鍵盤打數字（Backspace 刪除）。
  後端見 server/lockService.js。
-->
<template>
  <div class="lock-screen" role="dialog" aria-modal="true" :aria-label="title">
    <div class="lock-card" :class="{ shake }">
      <div class="lock-icon" aria-hidden="true">🔒</div>
      <h2 class="lock-title">{{ title }}</h2>
      <p class="lock-hint" :class="{ 'is-error': isError }" role="status">{{ message }}</p>

      <div class="dots" :aria-label="strings.digits(pin.length)">
        <span v-for="i in 4" :key="i" class="dot" :class="{ filled: i <= pin.length }"></span>
      </div>

      <div class="keypad">
        <button v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" :key="d" type="button" class="key" :disabled="busy || waiting > 0" @click="press(d)">
          {{ d }}
        </button>
        <span class="key-spacer" aria-hidden="true"></span>
        <button type="button" class="key" :disabled="busy || waiting > 0" @click="press('0')">0</button>
        <button type="button" class="key key-back" :aria-label="strings.backspace" :disabled="busy || !pin.length" @click="back">⌫</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  mode: { type: String, default: 'unlock' }, // 'setup' | 'unlock'
  strings: { type: Object, required: true }
});
const emit = defineEmits(['unlocked']);

const pin = ref('');
const firstPin = ref(''); // 設定模式的第一次輸入
const busy = ref(false);
const shake = ref(false);
const errorText = ref('');
const waiting = ref(0); // 輸錯太多次，還要等幾秒
let waitTimer = null;

const confirming = computed(() => props.mode === 'setup' && !!firstPin.value);
const title = computed(() =>
  props.mode === 'setup' ? (confirming.value ? props.strings.confirmTitle : props.strings.setupTitle) : props.strings.unlockTitle
);
const isError = computed(() => !!errorText.value || waiting.value > 0);
const message = computed(() => {
  if (waiting.value > 0) return props.strings.tooMany(waiting.value);
  if (errorText.value) return errorText.value;
  return props.mode === 'setup' ? props.strings.setupHint : '';
});

function fail(text) {
  errorText.value = text;
  pin.value = '';
  shake.value = false;
  requestAnimationFrame(() => (shake.value = true));
  setTimeout(() => (shake.value = false), 500);
}

function startWait(sec) {
  waiting.value = sec;
  clearInterval(waitTimer);
  waitTimer = setInterval(() => {
    waiting.value -= 1;
    if (waiting.value <= 0) {
      clearInterval(waitTimer);
      errorText.value = '';
    }
  }, 1000);
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { res, data: await res.json().catch(() => ({})) };
}

async function submit() {
  const value = pin.value;
  if (props.mode === 'setup' && !firstPin.value) {
    firstPin.value = value;
    pin.value = '';
    errorText.value = '';
    return;
  }
  if (props.mode === 'setup' && value !== firstPin.value) {
    firstPin.value = '';
    return fail(props.strings.mismatch);
  }
  busy.value = true;
  try {
    const { res, data } = await post(props.mode === 'setup' ? '/api/lock/setup' : '/api/lock/unlock', { pin: value });
    if (res.ok && data.token) {
      errorText.value = '';
      emit('unlocked', data.token);
      return;
    }
    if (res.status === 429) {
      fail('');
      startWait(data.retryAfterSec || 60);
    } else if (data.error === 'wrong_pin') {
      fail(props.strings.wrong(data.attemptsLeft));
    } else {
      fail(props.strings.error);
    }
  } catch {
    fail(props.strings.error);
  } finally {
    busy.value = false;
  }
}

function press(d) {
  if (busy.value || waiting.value > 0 || pin.value.length >= 4) return;
  pin.value += d;
  if (pin.value.length === 4) setTimeout(submit, 120); // 讓第四個點亮一下再送出
}
function back() {
  pin.value = pin.value.slice(0, -1);
}

function onKey(e) {
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    press(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    back();
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  clearInterval(waitTimer);
});
</script>

<style scoped>
.lock-screen {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  /* 完全不透明：後面的對話一個字都看不到 */
  background: linear-gradient(160deg, #fff4e3 0%, #ffe3cf 100%);
}
:global(.is-night) .lock-screen {
  background: linear-gradient(160deg, #2b2240 0%, #1d1830 100%);
}
.lock-card {
  width: min(320px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #4a3a2a;
}
:global(.is-night) .lock-card {
  color: #f3eaff;
}
.lock-icon {
  font-size: 34px;
}
.lock-title {
  margin: 0;
  font-size: 20px;
}
.lock-hint {
  margin: 0;
  min-height: 2.6em;
  font-size: 13px;
  text-align: center;
  opacity: 0.75;
}
.lock-hint.is-error {
  color: #b3261e;
  opacity: 1;
}
.dots {
  display: flex;
  gap: 16px;
  margin: 4px 0 10px;
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  opacity: 0.6;
  transition: background 0.12s, opacity 0.12s;
}
.dot.filled {
  background: #ff7a59;
  border-color: #ff7a59;
  opacity: 1;
}
.keypad {
  display: grid;
  grid-template-columns: repeat(3, 72px);
  gap: 14px;
}
.key {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px solid #e3d3bd;
  background: #ffffffcc;
  font-size: 26px;
  font-weight: 600;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
  transition: transform 0.08s, background 0.12s;
}
:global(.is-night) .key {
  background: #ffffff1f;
  border-color: #ffffff33;
}
.key:active:not(:disabled) {
  transform: scale(0.93);
  background: #ffe8cc;
}
.key:disabled {
  opacity: 0.45;
}
.key-back {
  font-size: 22px;
  border-style: dashed;
}
.shake {
  animation: shake 0.45s ease;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-10px); }
  40%, 80% { transform: translateX(10px); }
}
@media (max-height: 600px) {
  .keypad { grid-template-columns: repeat(3, 58px); gap: 10px; }
  .key { width: 58px; height: 58px; font-size: 22px; }
}
@media (prefers-reduced-motion: reduce) {
  .shake { animation: none; }
}
</style>
