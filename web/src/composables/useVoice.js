// useVoice.js
// 封裝 Web Speech API 的 STT（語音輸入）與 TTS（語音輸出），並處理
// Chrome / Safari 的相容性落差：
//   - STT：用 window.SpeechRecognition || window.webkitSpeechRecognition。
//     以我們寫這份程式碼時的瀏覽器支援狀況，Chrome / Edge 支援得很完整；
//     Safari 對這個 API 的支援不穩定（版本間差異大，常常整個沒有），
//     所以一律用 feature detection，偵測不到就讓上層元件切換成文字輸入，
//     而不是假裝「做好 Safari 相容性」卻其實會壞掉。
//   - TTS：SpeechSynthesis 在 Safari / iOS 上有「必須先有一次使用者手勢」
//     才能出聲的限制，所以提供 unlockAudio()，讓「按住說話」按鈕的第一次
//     互動順便觸發一次靜音的 utterance，之後才能正常朗讀 AI 回覆。

//   - 手機／平板（家裡 Wi‑Fi 連線、HTTPS）：不用瀏覽器的辨識（iPhone 上的 Chrome 不穩定），改成錄音後
//     交給 Mac 辨識（serverMode：recorder.js → POST /api/speech → server/speechService.js）。

import { computed } from 'vue';
import { sanitizeForSpeech } from '../voices.js';
import { serverFeatures } from '../limits.js';
import { recorderSupported, startRecording } from '../recorder.js';

const SpeechRecognitionCtor =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// 手機／平板用家裡網路連過來時是 HTTP（不是安全連線），瀏覽器不給用麥克風 → 當成不支援語音輸入，直接用打字
export const insecureContext = typeof window !== 'undefined' && window.isSecureContext === false;

export function useVoice() {
  // 手機連線＋Mac 的辨識可以用＋這個瀏覽器能錄音 → 錄音交給 Mac；否則用瀏覽器自己的辨識（電腦上的 Chrome）
  const serverMode = computed(() => serverFeatures.lan && serverFeatures.serverSpeech && recorderSupported());
  const supported = computed(() => serverMode.value || (!serverFeatures.lan && !!SpeechRecognitionCtor && !insecureContext));
  let recognition = null;
  let audioUnlocked = false;

  // ---- serverMode：錄音 → Mac 辨識 ----
  let session = null; // 這一次按住說話：{ recPromise, stopRequested, onResult, onError, finish }

  async function startServerListening({ onResult, onEnd, onError, onTranscribing }) {
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (session === s) session = null;
      onEnd?.();
    };
    const s = { stopRequested: false, onResult, onError, onTranscribing, finish, rec: null };
    session = s;
    try {
      s.rec = await startRecording({ onAutoStop: () => stopListening() });
    } catch (err) {
      onError?.(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'not-allowed' : 'audio-capture');
      finish();
      return;
    }
    // 麥克風還沒準備好就放開了（例如第一次跳出「允許麥克風」的詢問）
    if (s.stopRequested) await finishServerListening(s);
  }

  async function finishServerListening(s) {
    if (!s.rec) {
      s.stopRequested = true;
      return;
    }
    const rec = s.rec;
    s.rec = null;
    let blob = null;
    try {
      blob = await rec.stop();
    } catch {
      blob = null;
    }
    if (!blob) {
      s.onError?.('no-speech');
      s.finish();
      return;
    }
    s.onTranscribing?.();
    try {
      const res = await fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: blob });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.error === 'speech_unavailable') serverFeatures.serverSpeech = false; // 改成打字
        s.onError?.(data?.error === 'speech_unavailable' ? 'server-unavailable' : 'server-error');
      } else if (data?.text) {
        s.onResult?.(data.text);
      } else {
        s.onError?.('no-speech');
      }
    } catch {
      s.onError?.('network');
    } finally {
      s.finish();
    }
  }

  function startListening({ onResult, onEnd, onError, onTranscribing, lang = 'zh-TW' } = {}) {
    if (!supported.value) return;
    if (serverMode.value) {
      startServerListening({ onResult, onEnd, onError, onTranscribing });
      return;
    }

    // 每次重新建立一個 instance，避免上一輪的 onend/onresult 互相影響。
    recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim();
      if (text) onResult?.(text);
    };
    recognition.onerror = (event) => {
      // 常見錯誤：'not-allowed'（沒給麥克風權限）、'no-speech'（沒偵測到聲音）
      onError?.(event.error);
    };
    recognition.onend = () => {
      onEnd?.();
    };

    try {
      recognition.start();
    } catch (err) {
      // Safari 有時候會在還沒 stop 前又 start，丟出 InvalidStateError，直接吞掉即可。
      onError?.(err.message);
    }
  }

  function stopListening() {
    if (session) {
      const s = session;
      if (s.rec || !s.stopRequested) finishServerListening(s);
      return;
    }
    try {
      recognition?.stop();
    } catch {
      /* noop */
    }
  }

  function unlockAudio() {
    if (audioUnlocked || typeof window === 'undefined' || !window.speechSynthesis) return;
    audioUnlocked = true;
    try {
      const silent = new SpeechSynthesisUtterance(' ');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    } catch {
      /* noop */
    }
  }

  // 目前這一段朗讀的「結束」函式，stopSpeaking() 用它確保 onEnd 一定會被叫到
  // （不能只靠 speechSynthesis.cancel() 觸發 onend/onerror——上面說的 Chrome bug 情況下它們不會觸發）。
  let finishCurrent = null;

  /**
   * 立刻停止朗讀（使用者點角色打斷、或按了靜音）。會觸發當前這段的 onEnd，狀態一定會被釋放。
   */
  function stopSpeaking() {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
    finishCurrent?.();
  }

  // rate / pitch：App.vue 會依角色設定＋這句話的情緒算出來。voice：要用哪個聲音（SpeechSynthesisVoice，見 voices.js）。
  // onProgress(ratio 0～1)：唸到哪裡（瀏覽器有 boundary 事件時才會呼叫），長的話泡泡用它跟著捲動。
  function speak(rawText, { lang = 'zh-TW', rate = 1.0, pitch = 1.0, voice = null, onStart, onEnd, onProgress } = {}) {
    // 表情符號、「～」、（動作描述）不要唸（見 voices.js 的 sanitizeForSpeech）
    const text = sanitizeForSpeech(rawText);
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) {
      onEnd?.();
      return;
    }

    // 修正「第二次沒辦法傳訊息」的根本原因：
    // Chrome 有個已知的 bug——如果在 speechSynthesis.cancel() 之後「馬上」呼叫 speak()，
    // 瀏覽器有機率整個不出聲，而且連 onstart / onend / onerror 都不會觸發。
    // 因為 App.vue 是靠 onEnd 才把角色狀態從 SPEAKING 切回去，
    // 一旦 onEnd 沒被呼叫，按住說話的按鈕就會永遠停在「disabled」，
    // 使用者就會覺得「只能傳一次」。
    //
    // 解法兩層：
    //   1. cancel() 之後隔一小段時間再 speak()，避開這個 race condition。
    //   2. 無論如何都設一個依文字長度估計的保險 timeout，時間到了如果事件
    //      都還沒發生，就強制當作講完了，狀態一定會被釋放。
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (finishCurrent === finish) finishCurrent = null;
      onEnd?.();
    };
    finishCurrent = finish;

    const doSpeak = () => {
      if (done) return; // cancel 後等待的 60ms 內就被 stopSpeaking() 打斷了，不要再開口
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || lang;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.onstart = () => onStart?.();
      utterance.onend = finish;
      utterance.onerror = finish;
      if (onProgress) {
        utterance.onboundary = (e) => {
          if (!done && Number.isFinite(e.charIndex) && text.length) onProgress(Math.min(1, e.charIndex / text.length));
        };
      }
      window.speechSynthesis.speak(utterance);

      // 保險時間：以前最多 20 秒，話很長時還在唸就被當成唸完（泡泡跟著消失）。現在依長度與語速估，最多 2 分鐘。
      const estimatedMs = Math.min(Math.max((text.length * 260) / Math.max(rate, 0.5), 1500), 120000);
      setTimeout(finish, estimatedMs);
    };

    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
      setTimeout(doSpeak, 60);
    } else {
      doSpeak();
    }
  }

  return { supported, serverMode, startListening, stopListening, unlockAudio, speak, stopSpeaking };
}
