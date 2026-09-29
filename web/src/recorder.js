// recorder.js — 手機／平板的「按住說話」：錄音 → 16kHz 單聲道 WAV（交給 Mac 辨識，見 server/speechService.js）。
//
// 為什麼自己轉 WAV、不用 MediaRecorder：iPhone 的 MediaRecorder 錄出來是分段的 MP4，Mac 那邊不一定讀得了；
// WAV 最單純，哪一台都讀得懂。16kHz 單聲道 16-bit ＝ 每秒 32KB，家裡 Wi‑Fi 傳一下子就好。
//
// 注意（iPhone）：麥克風開著的時候，iOS 會把聲音輸出切到「通話模式」（角色講話變很小聲），
// 所以每次放開就把麥克風整個關掉，不要一直開著。
// 需要 HTTPS（瀏覽器規定），見 server/lanService.js。

const TARGET_RATE = 16000;
export const MAX_SECONDS = 60;
const MIN_SECONDS = 0.35;

export const recorderSupported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext === true &&
  !!navigator.mediaDevices?.getUserMedia &&
  !!(window.AudioContext || window.webkitAudioContext);

let ctx = null;

function audioContext() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

// 取樣率轉換（平均法，錄人聲夠用）
function downsample(chunks, fromRate) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    input.set(c, off);
    off += c.length;
  }
  if (fromRate === TARGET_RATE) return input;
  const ratio = fromRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

export function encodeWav(samples, rate = TARGET_RATE) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 單聲道
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * 開始錄音（要在按下按鈕的那一下呼叫：iOS 規定聲音相關的東西要由使用者的動作開始）。
 * @param {{ onAutoStop?: () => void }} [opts] 錄到 MAX_SECONDS 自動停（呼叫 onAutoStop，上層再呼叫 stop()）
 * @returns {Promise<{ stop: () => Promise<Blob|null>, cancel: () => void }>} stop() 回傳 WAV；太短回傳 null
 */
export async function startRecording({ onAutoStop } = {}) {
  const ac = audioContext();
  // 先 resume（還在使用者動作的同一個事件裡），再要麥克風
  const resumed = ac.state === 'suspended' ? ac.resume() : Promise.resolve();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  await resumed;
  const source = ac.createMediaStreamSource(stream);
  // ScriptProcessor 雖然舊，但 iPhone／iPad 的 Safari、Chrome 都穩定支援（AudioWorklet 要另外載入模組檔）
  const node = ac.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  const rate = ac.sampleRate;
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(node);
  node.connect(ac.destination); // 要接到輸出才會跑（輸出是靜音，onaudioprocess 沒寫 outputBuffer）
  const startedAt = performance.now();
  const autoTimer = setTimeout(() => onAutoStop?.(), MAX_SECONDS * 1000);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(autoTimer);
    node.onaudioprocess = null;
    try {
      source.disconnect();
      node.disconnect();
    } catch {
      /* noop */
    }
    for (const t of stream.getTracks()) t.stop();
    // 錄完就讓 AudioContext 睡著：iPhone 只要它還在跑，可能維持「錄音＋播放」模式，角色講話會從聽筒出來、很小聲
    ac.suspend?.().catch?.(() => {});
  };

  return {
    async stop() {
      close();
      if ((performance.now() - startedAt) / 1000 < MIN_SECONDS) return null;
      const samples = downsample(chunks, rate);
      if (samples.length < TARGET_RATE * MIN_SECONDS) return null;
      return encodeWav(samples);
    },
    cancel: close
  };
}
