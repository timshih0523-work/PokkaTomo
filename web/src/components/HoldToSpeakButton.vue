<!--
  HoldToSpeakButton.vue — 「按住說話 / 放開送出」按鈕，外加一個可以打開/收起的打字輸入框。

  設計成穩定優先：
    - pointerdown 開始錄音辨識，pointerup / pointerleave / pointercancel 都會停止，
      避免手指滑出按鈕範圍時卡住一直錄音。
    - 第一次按下時，順便呼叫 unlockAudio()（來自 useVoice），解鎖 Safari 的
      AudioContext / SpeechSynthesis，之後 TTS 才能正常出聲。
    - 瀏覽器不支援語音辨識時（目前只有 Chrome / Edge 完整支援 webkitSpeechRecognition，
      Safari 對 Web Speech API 的 STT 支援不穩定或不存在），直接固定顯示文字輸入框，
      不會讓使用者卡在一個沒反應的按鈕上。
    - 手機／平板（家裡 Wi‑Fi）：錄音後交給 Mac 辨識（useVoice 的 serverMode）。放開後要等 Mac 辨識完，
      這段時間按鈕顯示「聽清楚中…」、不能再按，角色維持「在聽」的樣子（辨識完才送出 stop-listening）。
    - 支援語音的瀏覽器則另外提供一個「⌨️」按鈕，點一下打開/收起打字輸入框，
      想打字傳訊息時不用只能靠語音。
-->
<template>
  <div class="hold-to-speak">
    <div v-if="supported" class="btn-row">
      <button
        class="hold-btn"
        :class="{ 'is-active': isHolding, 'is-busy': transcribing }"
        :disabled="disabled || transcribing"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
        @pointercancel="onPointerUp"
        :aria-label="strings.micLabel"
      >
        🎤
      </button>
      <button
        type="button"
        class="keyboard-toggle"
        :class="{ 'is-open': showTextInput }"
        @click="showTextInput = !showTextInput"
        :aria-label="showTextInput ? strings.toggleClose : strings.toggleOpen"
        :aria-pressed="showTextInput"
      >
        ⌨️
      </button>
    </div>

    <p v-if="supported" class="status-label">{{ hint }}</p>

    <!-- 打字框收起來時也保留它的位置（只是看不見、按不到），這樣打開／收起不會讓上面的角色跟著移動 -->
    <form
      class="fallback-input"
      :class="{ 'is-collapsed': !showTextInput }"
      :aria-hidden="!showTextInput"
      :inert="!showTextInput || undefined"
      @submit.prevent="submitFallback"
    >
      <!-- 字數上限從後端拿（web/src/limits.js ← GET /api/config ← server/config.js 的 LIMITS），
           打字當下就打不出超過限制的訊息，不用等送出後才被伺服器退回來。 -->
      <input
        v-model="fallbackText"
        type="text"
        :maxlength="limits.message ?? undefined"
        :placeholder="supported ? strings.placeholderSupported : strings.placeholderUnsupported"
        @keydown.enter="onEnterKey"
      />
      <button type="submit" :disabled="disabled">{{ strings.send }}</button>
    </form>

    <p v-if="!supported" class="unsupported-note">
      {{ insecureContext || serverFeatures.lan ? strings.unsupportedNoteRemote : strings.unsupportedNote }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useVoice, insecureContext } from '../composables/useVoice.js';
import { limits, serverFeatures } from '../limits.js';
import { getStrings } from '../i18n.js';

const props = defineProps({
  disabled: { type: Boolean, default: false },
  // 'zh-TW' 或 'ja-JP'：決定語音辨識(STT)要聽哪種語言。
  lang: { type: String, default: 'zh-TW' },
  // 介面文字字典（來自 i18n.js 的 getStrings()），由 App.vue 依目前語言傳進來。
  strings: { type: Object, default: () => getStrings('zh') },
  // disabled 時顯示的提示；不給的話用 strings.hintBusy。App.vue 在角色講話時會改傳
  // 「點角色可以讓牠停下來」，告訴使用者現在不是只能乾等。
  busyHint: { type: String, default: '' },
  // 可以按、但想換掉「按住說話」的提示時用（例如角色睡著時提醒「說話會叫醒牠」）
  idleHint: { type: String, default: '' }
});

const emit = defineEmits(['start-listening', 'result', 'stop-listening', 'unlock-audio', 'voice-error']);

const { supported, serverMode, startListening, stopListening, unlockAudio } = useVoice();

const isHolding = ref(false);
const transcribing = ref(false); // 手機：放開後等 Mac 辨識中
const fallbackText = ref('');
// 語音辨識可用時，打字框預設收起（用⌨️按鈕打開）；不支援語音時，直接固定打開。
const showTextInput = ref(!supported.value);
// 能不能用語音是從伺服器拿到設定後才確定的（手機上 Mac 的辨識不能用時會變成打字）
watch(supported, (ok) => {
  if (!ok) showTextInput.value = true;
});
let unlocked = false;

const hint = computed(() => {
  if (transcribing.value) return props.strings.hintTranscribing;
  if (props.disabled) return props.busyHint || props.strings.hintBusy;
  if (isHolding.value) return props.strings.hintRelease;
  return props.idleHint || props.strings.hintHold;
});

// 切換語言時，如果正在錄音就先停掉，避免用舊語言的辨識器錄到一半。
watch(
  () => props.lang,
  () => {
    if (isHolding.value) {
      stopListening();
      isHolding.value = false;
    }
  }
);

function ensureAudioUnlocked() {
  if (!unlocked) {
    unlocked = true;
    unlockAudio();
    emit('unlock-audio');
  }
}

function onPointerDown(e) {
  if (props.disabled || transcribing.value) return;
  e.preventDefault();
  ensureAudioUnlocked();
  isHolding.value = true;
  emit('start-listening');
  startListening({
    lang: props.lang,
    onResult: (text) => emit('result', text),
    onTranscribing: () => (transcribing.value = true),
    onEnd: () => {
      isHolding.value = false;
      transcribing.value = false;
      emit('stop-listening');
    },
    // 沒給麥克風權限、沒偵測到聲音等等——之前這裡完全沒接，使用者按了沒反應
    // 也不知道為什麼，只能自己猜。現在把原始錯誤代碼往上丟，讓 App.vue 決定要說什麼。
    onError: (code) => emit('voice-error', code)
  });
}

function onPointerUp() {
  if (!isHolding.value) return;
  isHolding.value = false;
  stopListening();
  // 手機（Mac 辨識）：辨識完 onEnd 才送 stop-listening，角色在這段時間維持「在聽」
  if (!serverMode.value) emit('stop-listening');
}

// 日文/中文輸入法（IME）選字時按的 Enter 是「確定這個字」，不是「送出訊息」。
// Chrome 選字中不會觸發表單送出，但 Safari 有個老問題：確定選字的那一下 Enter 還是會
// 送出表單——日文打字幾乎每句都要按 Enter 轉換漢字，話打到一半就被送出去了。
// isComposing（標準）跟 keyCode 229（Safari 選字中的代碼）任一成立就擋掉這次的預設動作。
function onEnterKey(e) {
  if (e.isComposing || e.keyCode === 229) {
    e.preventDefault();
  }
}

function submitFallback() {
  if (props.disabled) return;
  const text = fallbackText.value.trim();
  if (!text) return;
  ensureAudioUnlocked();
  emit('result', text);
  fallbackText.value = '';
}
</script>

<style scoped>
.hold-to-speak {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.btn-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.keyboard-toggle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid #d8cdbf;
  background: #ffffffcc;
  font-size: 18px;
  transition: transform 0.12s ease, background 0.12s ease;
}
.keyboard-toggle.is-open {
  background: #ffe1c7;
  transform: scale(0.94);
}
.fallback-input.is-collapsed {
  visibility: hidden;
}
</style>
