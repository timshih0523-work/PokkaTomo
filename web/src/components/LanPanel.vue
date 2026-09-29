<!--
  LanPanel.vue — 設定面板裡的「手機／平板連線」（全部角色共用；後端 server/lanService.js）。
  打開後同一個 Wi‑Fi 的 iPhone／iPad 可以用瀏覽器打開 PokkaTomo（HTTPS，手機上也能按住說話）。
    1. 每台手機第一次：掃「第一次設定」的 QR code（HTTP 設定頁，server/lanSetupApp.js）安裝憑證。
    2. 之後：掃「開始使用」的 QR code（https://）。
  下面顯示手機語音輸入（Mac 辨識，server/speechService.js）的狀態，需要時告訴開發者要做什麼。
  開關只能在電腦上操作；在手機上打開設定時只顯示狀態。
-->
<template>
  <div class="field lan-field">
    <span class="field-label">{{ strings.title }}</span>
    <p v-if="loadError" class="field-hint is-error">{{ strings.loadFailed }}</p>
    <template v-else-if="info">
      <label v-if="info.canManage" class="lan-toggle">
        <input type="checkbox" :checked="info.enabled" :disabled="busy" @change="toggle($event.target.checked)" />
        <span>{{ strings.enable }}</span>
      </label>
      <p v-else class="field-hint">{{ strings.remoteNote }}</p>

      <p v-if="error" class="field-hint is-error" role="alert">{{ error }}</p>

      <template v-if="info.enabled && info.running && info.canManage">
        <div class="lan-step">
          <span class="step-title">① {{ strings.setupTitle }}</span>
          <div class="lan-connect">
            <!-- eslint-disable-next-line vue/no-v-html -- QR code 是這裡自己產生的 SVG -->
            <div class="lan-qr" v-html="qrOf(info.setupUrls?.[0])" :aria-label="strings.setupQrLabel" role="img"></div>
            <div class="lan-urls">
              <span class="field-hint">{{ strings.setupHint }}</span>
              <code class="lan-url">{{ info.setupUrls?.[0] }}</code>
            </div>
          </div>
        </div>
        <div class="lan-step">
          <span class="step-title">② {{ strings.openTitle }}</span>
          <div class="lan-connect">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="lan-qr" v-html="qrOf(info.urls?.[0])" :aria-label="strings.qrLabel" role="img"></div>
            <div class="lan-urls">
              <span class="field-hint">{{ strings.openOnPhone }}</span>
              <code v-for="u in info.urls" :key="u" class="lan-url">{{ u }}</code>
            </div>
          </div>
        </div>
      </template>
      <p v-if="info.enabled && !info.running && info.canManage" class="field-hint is-error">
        {{ info.error === 'port_in_use' ? strings.portInUse(info.port) : info.error === 'tls_failed' ? strings.tlsFailed : strings.notRunning }}
      </p>
      <p v-if="info.running && info.error === 'setup_port_in_use' && info.canManage" class="field-hint is-error">
        {{ strings.portInUse(info.setupPort) }}
      </p>

      <!-- 手機上的語音輸入（Mac 辨識）的狀態 -->
      <div v-if="info.enabled && speechLine" class="lan-speech" :class="`is-${speechLine.kind}`" role="status">
        <span>🎤 {{ speechLine.text }}</span>
        <button v-if="info.canManage && speechLine.retry" type="button" class="btn-small" :disabled="checking" @click="recheck">
          {{ checking ? strings.speechChecking : strings.speechRecheck }}
        </button>
      </div>

      <p class="field-hint">{{ strings.hint }}</p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import qrcode from 'qrcode-generator';

const props = defineProps({ strings: { type: Object, required: true } });

const info = ref(null);
const loadError = ref(false);
const busy = ref(false);
const checking = ref(false);
const error = ref('');
let pollTimer = null;
let pollUntil = 0;

async function load() {
  try {
    const res = await fetch('/api/lan');
    if (!res.ok) throw new Error();
    info.value = await res.json();
    loadError.value = false;
  } catch {
    loadError.value = true;
  }
  schedulePoll();
}

// 語音辨識還在準備（編譯中、等 Mac 上按「允許」）：每 3 秒更新一次，最多 5 分鐘
function speechPending(sp) {
  return !!sp && (sp.state === 'idle' || sp.state === 'building' || (sp.state === 'ready' && (sp.auth === 'unknown' || sp.auth === 'notDetermined')));
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (!info.value?.enabled || !speechPending(info.value?.speech)) return;
  if (!pollUntil) pollUntil = Date.now() + 5 * 60 * 1000;
  if (Date.now() > pollUntil) return;
  pollTimer = setTimeout(load, 3000);
}

async function toggle(on) {
  busy.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/lan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: on })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      error.value = data?.error === 'pin_required' ? props.strings.pinRequired : props.strings.saveFailed;
      await load();
      return;
    }
    info.value = data;
    pollUntil = 0;
    schedulePoll();
  } catch {
    error.value = props.strings.saveFailed;
  } finally {
    busy.value = false;
  }
}

async function recheck() {
  checking.value = true;
  try {
    const res = await fetch('/api/lan/speech-check', { method: 'POST' });
    if (res.ok) info.value = await res.json();
  } catch {
    /* 下面 load() 會再拿一次 */
  } finally {
    checking.value = false;
    pollUntil = 0;
    await load();
  }
}

const speechLine = computed(() => {
  const sp = info.value?.speech;
  const s = props.strings;
  if (!sp || sp.state === 'unsupported') return null;
  if (sp.available) return { kind: 'ok', text: s.speechReady };
  if (sp.state === 'no_compiler') return { kind: 'error', text: s.speechNoCompiler, retry: true };
  if (sp.state === 'build_failed') return { kind: 'error', text: s.speechBuildFailed, retry: true };
  if (sp.state === 'idle' || sp.state === 'building') return { kind: 'wait', text: s.speechBuilding };
  if (sp.auth === 'denied' || sp.auth === 'restricted') return { kind: 'error', text: s.speechDenied, retry: true };
  return { kind: 'wait', text: s.speechAsk, retry: true };
});

function qrOf(url) {
  if (!url) return '';
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

onMounted(load);
onBeforeUnmount(() => clearTimeout(pollTimer));
defineExpose({ reload: load });
</script>

<style scoped>
.lan-field {
  border-top: 1px dashed #e3d6c4;
  padding-top: 10px;
}
.lan-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
}
.lan-toggle input {
  width: 18px;
  height: 18px;
}
.lan-step {
  margin: 8px 0;
}
.step-title {
  font-size: 13px;
  font-weight: 700;
}
.lan-connect {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin: 4px 0;
}
.lan-qr {
  width: 110px;
  height: 110px;
  background: #fff;
  border-radius: 8px;
  padding: 4px;
  flex: none;
}
.lan-qr :deep(svg) {
  width: 100%;
  height: 100%;
}
.lan-urls {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.lan-url {
  font-size: 13px;
  background: #fff4e6;
  border-radius: 6px;
  padding: 3px 6px;
  overflow-wrap: anywhere;
  user-select: all;
}
.lan-speech {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  border-radius: 8px;
  padding: 6px 10px;
  margin: 6px 0;
  background: #fff4e6;
}
.lan-speech.is-ok {
  background: #e8f6ec;
}
.lan-speech.is-error {
  background: #fdeaea;
  color: #b3261e;
}
.btn-small {
  border: 1px solid #d8cdbf;
  background: #fff;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
}
.is-error {
  color: #b3261e;
}
</style>
