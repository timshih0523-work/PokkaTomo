<!--
  SettingsPanel.vue — 設定面板：角色的名字、怎麼稱呼使用者、AI 個性、喜好、紀念日。

  設計成不用碰 JSON 檔就能改：非技術使用者只要點右上角齒輪，
  改一改欄位、按儲存，就會呼叫 POST /api/profile 存進角色資料夾的 user.json／character.json，
  下一輪對話就會反映在 AI 的人設裡（見 fmService.buildSystemPrompt）。

  這個元件不自己 fetch，profile 資料由 App.vue 傳進來（單一資料來源），
  儲存成功後也是由 App.vue 決定要不要更新畫面上的稱呼等等。
-->
<template>
  <!-- 背景遮罩、✕、Esc、dialog 語意、焦點都由 BaseDialog 處理（跟日記面板共用）。 -->
  <BaseDialog
    :open="open"
    :title="strings.title"
    :close-label="strings.close"
    :initial-focus="firstFieldEl"
    @close="$emit('close')"
  >

          <label class="field">
            <span class="field-label">{{ strings.companionNameLabel }}</span>
            <input
              ref="firstFieldEl"
              v-model="form.companionName"
              type="text"
              :placeholder="strings.companionNamePlaceholder"
              :maxlength="limits.companionName ?? undefined"
            />
          </label>

          <label class="field">
            <span class="field-label">{{ strings.nicknameLabel }}</span>
            <input
              v-model="form.nickname"
              type="text"
              :placeholder="strings.nicknamePlaceholder"
              :maxlength="limits.nickname ?? undefined"
            />
          </label>

          <label class="field">
            <span class="field-label">{{ strings.personaLabel }}</span>
            <textarea
              v-model="form.personaPrompt"
              rows="3"
              :maxlength="limits.persona ?? undefined"
              :placeholder="strings.personaHint"
            ></textarea>
            <span v-if="limits.persona" class="char-count">{{ strings.charCount(form.personaPrompt.length, limits.persona) }}</span>
            <span class="field-hint">{{ strings.personaHint }}</span>
          </label>

          <label class="field">
            <span class="field-label">{{ strings.cityLabel }}</span>
            <input v-model="form.city" type="text" :placeholder="strings.cityPlaceholder" :maxlength="limits.city ?? undefined" />
            <span v-if="currentPlace" class="field-hint">{{ strings.cityCurrent(currentPlace) }}</span>
          </label>

          <label class="field">
            <span class="field-label">{{ strings.preferencesLabel }}</span>
            <input v-model="preferencesText" type="text" :placeholder="strings.preferencesPlaceholder" />
          </label>

          <div class="field">
            <span class="field-label">{{ strings.anniversariesLabel }}</span>
            <div
              v-for="(item, i) in form.anniversaries"
              :key="i"
              class="anniversary-row"
              :class="{ 'is-incomplete': showIncomplete && isIncomplete(item) }"
            >
              <input
                v-model="item.name"
                type="text"
                :placeholder="strings.anniversaryNamePlaceholder"
                :maxlength="limits.anniversaryName ?? undefined"
              />
              <input v-model="item.date" type="date" />
              <button type="button" class="remove-btn" @click="removeAnniversary(i)" :aria-label="strings.removeAnniversary">
                🗑️
              </button>
            </div>
            <button
              v-if="!limits.anniversariesCount || form.anniversaries.length < limits.anniversariesCount"
              type="button"
              class="add-btn"
              @click="addAnniversary"
            >
              {{ strings.addAnniversary }}
            </button>
          </div>

          <div class="field">
            <span class="field-label" id="avatar-style-label">{{ strings.avatarStyleLabel }}</span>
            <div class="segmented" role="radiogroup" aria-labelledby="avatar-style-label">
              <button
                v-for="opt in ['full', 'classic']"
                :key="opt"
                type="button"
                role="radio"
                :aria-checked="form.avatarStyle === opt"
                :class="{ active: form.avatarStyle === opt }"
                @click="form.avatarStyle = opt"
              >
                {{ opt === 'full' ? strings.avatarFull : strings.avatarClassic }}
              </button>
            </div>
          </div>

          <PaletteChooser v-model="form.palette" :label="strings.paletteLabel" :names="paletteNames" />

          <!-- 說話的語言：建立角色時決定，這裡只顯示、不能改（介面語言用上方 🌐 切換） -->
          <div class="field">
            <span class="field-label">{{ strings.speakLanguageLabel }}</span>
            <span class="readonly-value">{{ languageName }}</span>
            <span class="field-hint">{{ strings.speakLanguageHint }}</span>
          </div>

          <!-- 聲音（每個角色、每種語言可以不同；見 web/src/voices.js） -->
          <div class="field voice-field">
            <span class="field-label">{{ strings.voiceLabel }}</span>
            <select v-model="form.voice" :aria-label="strings.voiceLabel">
              <option value="">{{ strings.voiceAuto(autoVoiceName) }}</option>
              <option v-for="v in voiceOptions" :key="v.voiceURI" :value="v.voiceURI">{{ v.label }}</option>
            </select>
            <div class="slider-row">
              <label>
                <span>{{ strings.voicePitch }}</span>
                <input v-model.number="form.voicePitch" type="range" min="0.7" max="1.5" step="0.05" />
              </label>
              <label>
                <span>{{ strings.voiceRate }}</span>
                <input v-model.number="form.voiceRate" type="range" min="0.75" max="1.3" step="0.05" />
              </label>
              <button type="button" class="add-btn" @click="preview">🔈 {{ strings.voicePreview }}</button>
            </div>
            <span class="field-hint">{{ voiceOptions.length ? strings.voiceHint : strings.voiceNone }}</span>
          </div>

          <!-- 改密碼（四位數，後端 server/lockService.js）。跟上面的「儲存」分開，有自己的按鈕 -->
          <div class="field pin-field">
            <span class="field-label">{{ strings.pinLabel }}</span>
            <div class="pin-row">
              <input v-model="pin.current" type="password" inputmode="numeric" autocomplete="off" maxlength="4" :placeholder="strings.pinCurrent" :aria-label="strings.pinCurrent" />
              <input v-model="pin.next" type="password" inputmode="numeric" autocomplete="off" maxlength="4" :placeholder="strings.pinNew" :aria-label="strings.pinNew" />
              <input v-model="pin.confirm" type="password" inputmode="numeric" autocomplete="off" maxlength="4" :placeholder="strings.pinConfirm" :aria-label="strings.pinConfirm" />
            </div>
            <button type="button" class="add-btn" :disabled="pinSaving" @click="changePin">{{ strings.pinSave }}</button>
            <span v-if="pinMsg" class="save-status" :class="{ 'is-error': pinIsError }" role="status">{{ pinMsg }}</span>
          </div>

          <div class="field data-field">
            <span class="field-label">{{ strings.dataLabel }}</span>
            <!-- API 要帶密碼 token，<a href> 帶不了，所以用 fetch 下載（見 web/src/api.js 的 downloadFrom） -->
            <button type="button" class="export-btn" :disabled="exporting" @click="exportAll">{{ strings.exportButton }}</button>
            <span class="field-hint">{{ exportError || strings.exportHint }}</span>

            <!-- 匯入：選之前匯出的 zip → 再輸入一次密碼 → 換成 zip 裡的資料（現在的資料後端會先另外存一份） -->
            <input ref="importFileEl" type="file" accept=".zip,application/zip" class="visually-hidden" @change="onImportFile" />
            <button v-if="!importFile" type="button" class="export-btn" @click="importFileEl?.click()">{{ strings.importButton }}</button>
            <div v-else class="import-confirm">
              <p class="import-warn">⚠️ {{ strings.importWarn(importFile.name) }}</p>
              <PinField v-model="importPin" :label="strings.importPinLabel" @enter="doImport" />
              <div class="pin-row">
                <button type="button" class="add-btn" :disabled="importing" @click="cancelImport">{{ strings.importCancel }}</button>
                <button type="button" class="export-btn import-go" :disabled="importing || importPin.length !== 4" @click="doImport">
                  {{ importing ? strings.importing : strings.importConfirm }}
                </button>
              </div>
            </div>
            <span v-if="importError" class="save-status is-error" role="alert">{{ importError }}</span>
          </div>

    <!-- 儲存結果：成功就直接關掉面板（App.vue 顯示「已儲存」提示）；失敗的訊息放在底部按鈕旁邊，
         不管捲到哪裡都看得到（以前放在表單最下面，要捲到底才看得到，搞不清楚到底存了沒）。 -->
    <template #footer>
      <p v-if="statusMsg" class="save-status footer-status" role="alert" :class="{ 'is-error': statusIsError }">
        ⚠️ {{ statusMsg }}
      </p>
      <button type="button" class="btn-secondary" @click="$emit('close')">{{ strings.cancel }}</button>
      <button type="button" class="btn-primary" :disabled="saving" @click="onSave">{{ strings.save }}</button>
    </template>
  </BaseDialog>
</template>

<script setup>
import PinField from './PinField.vue';
import { pinErrorMessage } from '../pinErrors.js';
import { ref, reactive, watch, computed } from 'vue';
import BaseDialog from './BaseDialog.vue';
import { limits, clampText } from '../limits.js';
import { downloadFrom } from '../api.js';
import PaletteChooser from './PaletteChooser.vue';
import { voicesForLanguage, sortVoices, voiceLabel, pickVoice } from '../voices.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  profile: { type: Object, default: () => ({}) },
  strings: { type: Object, required: true },
  paletteNames: { type: Object, default: () => ({}) },
  // 這台瀏覽器可用的聲音（App.vue 從 speechSynthesis 拿）＋角色說話的語言（不是介面語言）
  voices: { type: Array, default: () => [] },
  language: { type: String, default: 'zh' },
  languageName: { type: String, default: '' },
  lockStrings: { type: Object, default: () => ({}) } // t.lock：再確認密碼錯誤時的訊息
});

// ---- 聲音 ----
const voiceOptions = computed(() =>
  sortVoices(voicesForLanguage(props.voices, props.language)).map((v) => ({ voiceURI: v.voiceURI, label: voiceLabel(v) }))
);
const autoVoiceName = computed(() => pickVoice(props.voices, props.language, '')?.name || '');
function preview() {
  emit('preview-voice', { voiceURI: form.voice, pitch: form.voicePitch, rate: form.voiceRate });
}

// ---- 匯出 ----
const exporting = ref(false);
const exportError = ref('');
async function exportAll() {
  exporting.value = true;
  exportError.value = '';
  try {
    await downloadFrom('/api/export', 'pokkatomo.zip');
  } catch {
    exportError.value = props.strings.exportFailed;
  } finally {
    exporting.value = false;
  }
}

// ---- 匯入備份 ----
const importFileEl = ref(null);
const importFile = ref(null);
const importPin = ref('');
const importing = ref(false);
const importError = ref('');
function onImportFile(e) {
  importFile.value = e.target.files?.[0] || null;
  importPin.value = '';
  importError.value = '';
  e.target.value = ''; // 同一個檔案可以再選一次
}
function cancelImport() {
  importFile.value = null;
  importPin.value = '';
  importError.value = '';
}
async function doImport() {
  if (!importFile.value || importPin.value.length !== 4 || importing.value) return;
  importing.value = true;
  importError.value = '';
  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'X-PokkaTomo-Pin': importPin.value },
      body: importFile.value
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      importPin.value = '';
      importError.value =
        data?.error === 'wrong_pin' || data?.error === 'too_many_attempts'
          ? pinErrorMessage(data, props.lockStrings)
          : data?.error === 'not_backup' || data?.error === 'bad_zip' || data?.error === 'bad_backup'
            ? props.strings.importNotBackup
            : props.strings.importFailed;
      return;
    }
    importFile.value = null;
    importPin.value = '';
    emit('imported', data);
  } catch {
    importError.value = props.strings.importFailed;
  } finally {
    importing.value = false;
  }
}

// ---- 改密碼 ----
const pin = reactive({ current: '', next: '', confirm: '' });
const pinSaving = ref(false);
const pinMsg = ref('');
const pinIsError = ref(false);
async function changePin() {
  pinIsError.value = true;
  if (!/^\d{4}$/.test(pin.next)) return (pinMsg.value = props.strings.pinFormat);
  if (pin.next !== pin.confirm) return (pinMsg.value = props.strings.pinMismatch);
  pinSaving.value = true;
  try {
    const res = await fetch('/api/lock/change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: pin.current, next: pin.next })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      pinIsError.value = false;
      pinMsg.value = props.strings.pinSaved;
      pin.current = pin.next = pin.confirm = '';
    } else if (data.error === 'wrong_pin') {
      pinMsg.value = props.strings.pinWrong(data.attemptsLeft);
    } else if (res.status === 429) {
      pinMsg.value = props.strings.pinTooMany(data.retryAfterSec || 60);
    } else {
      pinMsg.value = props.strings.pinFailed;
    }
  } catch {
    pinMsg.value = props.strings.pinFailed;
  } finally {
    pinSaving.value = false;
  }
}

const emit = defineEmits(['close', 'saved', 'preview-voice', 'imported']);

const form = reactive({
  city: '',
  companionName: '',
  nickname: '',
  personaPrompt: '',
  avatarStyle: 'full',
  palette: 'peach',
  voice: '',
  voicePitch: 1.05,
  voiceRate: 1.0,
  anniversaries: []
});
const preferencesText = ref('');
const saving = ref(false);
const statusMsg = ref('');
const statusIsError = ref(false);
// 目前存著的天氣地點（伺服器查到的正式地名），顯示在城市欄位下面讓使用者確認有沒有找對地方。
const location = ref(null);
const currentPlace = computed(() =>
  location.value ? [location.value.name, location.value.country].filter(Boolean).join('，') : ''
);

// 城市有改才去查經緯度（PUT /api/weather/location）。回傳 { ok, message, warning }：
// 找不到地名 → 不存其他欄位，讓使用者先改城市；網路查不到 → 其他欄位照存，只提示天氣地點沒更新。
async function updateCityIfChanged() {
  const q = form.city.trim();
  if (q === (location.value?.query || '')) return { ok: true };
  try {
    const res = await fetch('/api/weather/location', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q })
    });
    if (!res.ok) return { ok: true, warning: props.strings.cityLookupFailed };
    const data = await res.json();
    if (data.notFound) return { ok: false, message: props.strings.cityNotFound(q) };
    location.value = data.location;
    return { ok: true };
  } catch {
    return { ok: true, warning: props.strings.cityLookupFailed };
  }
}
const firstFieldEl = ref(null);
// 按過儲存、但有紀念日只填一半時才把那幾列標紅，不要一打開面板、剛按「新增」就一片紅。
const showIncomplete = ref(false);

// 名稱跟日期只填了其中一個——以前這種列在儲存時會被默默過濾掉，畫面上顯示「已儲存～」，
// 使用者以為存好了，下次打開才發現那筆紀念日不見了。兩個都空白的列就當成沒填，直接略過沒關係。
function isIncomplete(item) {
  const hasName = !!item.name.trim();
  const hasDate = !!item.date;
  return hasName !== hasDate;
}

// 每次打開面板時，用目前的 profile 重新填一次表單，避免顯示上一次沒存檔的殘留內容。
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    form.companionName = props.profile?.companionName || '';
    form.city = props.profile?.location?.query || '';
    location.value = props.profile?.location || null;
    form.nickname = props.profile?.nickname || '';
    form.personaPrompt = clampText(props.profile?.personaPrompt || '', limits.persona);
    form.avatarStyle = props.profile?.avatarStyle === 'classic' ? 'classic' : 'full';
    form.palette = props.profile?.palette || 'peach';
    form.voice = props.profile?.voice || '';
    form.voicePitch = props.profile?.voicePitch || 1.05;
    form.voiceRate = props.profile?.voiceRate || 1.0;
    pin.current = pin.next = pin.confirm = '';
    pinMsg.value = '';
    exportError.value = '';
    cancelImport();
    form.anniversaries = Array.isArray(props.profile?.anniversaries)
      ? props.profile.anniversaries.map((a) => ({ name: a.name || '', date: a.date || '', noYear: !!a.noYear, origDate: a.date || '' }))
      : [];
    preferencesText.value = Array.isArray(props.profile?.preferences) ? props.profile.preferences.join(', ') : '';
    statusMsg.value = '';
    statusIsError.value = false;
    showIncomplete.value = false;
  }
);

function addAnniversary() {
  form.anniversaries.push({ name: '', date: '' });
}

function removeAnniversary(index) {
  form.anniversaries.splice(index, 1);
}

async function onSave() {
  if (form.anniversaries.some(isIncomplete)) {
    showIncomplete.value = true;
    statusMsg.value = props.strings.anniversaryIncomplete;
    statusIsError.value = true;
    return;
  }
  showIncomplete.value = false;
  saving.value = true;
  statusMsg.value = '';

  const city = await updateCityIfChanged();
  if (!city.ok) {
    statusMsg.value = city.message;
    statusIsError.value = true;
    saving.value = false;
    return;
  }

  const preferences = preferencesText.value
    .split(/[,，、]/)
    .map((s) => clampText(s.trim(), limits.preference))
    .filter(Boolean)
    .slice(0, limits.preferencesCount ?? undefined);

  // 只知道月日的紀念日（noYear）：日期沒被改過就保留這個標記；她自己選了完整日期就當成有年份
  const anniversaries = form.anniversaries
    .map((a) => ({ name: a.name.trim(), date: a.date, ...(a.noYear && a.date === a.origDate ? { noYear: true } : {}) }))
    .filter((a) => a.name && a.date);

  const payload = {
    companionName: form.companionName.trim(),
    nickname: form.nickname.trim(),
    personaPrompt: form.personaPrompt.trim(),
    avatarStyle: form.avatarStyle,
    palette: form.palette,
    voice: form.voice,
    voicePitch: form.voicePitch,
    voiceRate: form.voiceRate,
    preferences,
    anniversaries
  };

  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('bad response');
    const saved = await res.json();
    // 成功：關掉面板，提示交給 App.vue（城市查不到但其他都存好的話，提示裡說明）
    emit('saved', saved, { message: city.warning || props.strings.saved, warning: !!city.warning });
    emit('close');
  } catch {
    statusMsg.value = props.strings.saveFailed;
    statusIsError.value = true;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.field-label {
  font-weight: 600;
  color: #4a3a2a;
}
.field-hint {
  font-size: 11px;
  opacity: 0.6;
}
.char-count {
  align-self: flex-end;
  font-size: 11px;
  opacity: 0.5;
}

.field input[type='text'],
.field input[type='date'],
.field textarea {
  border: 1px solid #d8cdbf;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  background: #ffffff;
}
.field textarea {
  resize: vertical;
}

.anniversary-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.anniversary-row.is-incomplete input {
  border-color: #b3261e;
  background: #fff4f2;
}
.anniversary-row input {
  /* 日期欄位在瀏覽器裡有自己的最小寬度，不設 0 的話窄畫面會把整列撐出面板外面 */
  min-width: 0;
}
.anniversary-row input[type='text'] {
  flex: 1.2;
}
.anniversary-row input[type='date'] {
  flex: 1;
}
.remove-btn {
  border: none;
  background: transparent;
  font-size: 15px;
  padding: 4px;
}

.add-btn {
  align-self: flex-start;
  border: 1px dashed #c9b89e;
  background: transparent;
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 13px;
  color: #7a5c3a;
}

.segmented {
  display: inline-flex;
  align-self: flex-start;
  background: #f3e9dc;
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
}
.segmented button {
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  color: #7a5c3a;
}
.segmented button.active {
  background: #ffffff;
  color: #4a3a2a;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(74, 58, 42, 0.18);
}

.readonly-value {
  font-size: 15px;
  font-weight: 600;
  padding: 4px 0;
}
.voice-field select {
  border: 1px solid #d8cdbf;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  background: #ffffff;
}
.slider-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}
.slider-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 400;
}
.slider-row input[type='range'] {
  width: 100px;
}
.pin-row {
  display: flex;
  gap: 6px;
}
.pin-row input {
  flex: 1;
  min-width: 0;
  border: 1px solid #d8cdbf;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  letter-spacing: 0.2em;
}
.pin-row input::placeholder {
  letter-spacing: normal;
  font-size: 11px;
}
.pin-field,
.data-field {
  border-top: 1px dashed #e3d6c4;
  padding-top: 10px;
}
.export-btn {
  align-self: flex-start;
  border: 1px solid #c9b89e;
  border-radius: 10px;
  padding: 7px 14px;
  font-size: 13px;
  color: #4a3a2a;
  background: #fffaf3;
  text-decoration: none;
}
.export-btn:hover {
  background: #fff1df;
}
.data-field .export-btn + .field-hint {
  margin-bottom: 6px;
}
.import-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: #fff4e6;
}
.import-warn {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  font-weight: 400;
}
.import-go {
  background: #ff7a59;
  border-color: #ff7a59;
  color: #fff;
}
.import-go:hover {
  background: #f06a48;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.footer-status {
  flex: 1;
  align-self: center;
  margin: 0 !important;
  padding: 6px 10px;
  border-radius: 10px;
  background: #fdecea;
  font-size: 13px !important;
  line-height: 1.4;
}
.save-status {
  font-size: 12px;
  color: #2e7d32;
  margin: 0;
}
.save-status.is-error {
  color: #b3261e;
}

.btn-secondary,
.btn-primary {
  border: none;
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 600;
}
.btn-secondary {
  background: #eee2d2;
  color: #4a3a2a;
}
.btn-primary {
  background: #ff7a59;
  color: white;
}
.btn-primary:disabled {
  opacity: 0.6;
}

</style>
