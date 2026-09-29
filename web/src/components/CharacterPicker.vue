<!--
  CharacterPicker.vue — 選角色（輸入密碼之後、或按上方「換角色」）。也可以在這裡新增角色。
  每個角色有自己的名字、外觀、毛色、對話、日記、親密度（後端 server/characterService.js、lib/characterContext.js）。
  個性描述等細節新增後在設定面板改。
  emit('select', character)
-->
<template>
  <div class="picker-screen" role="dialog" aria-modal="true" :aria-label="strings.title">
    <div class="picker-inner">
      <template v-if="!adding && !deleting">
        <h2 class="picker-title">{{ strings.title }}</h2>
        <p v-if="error" class="picker-error" role="alert">{{ error }}</p>
        <div class="grid">
          <div v-for="c in characters" :key="c.id" class="card-wrap">
            <button type="button" class="card" :class="{ current: c.id === currentId }" @click="$emit('select', c)">
              <span class="mini" aria-hidden="true">
                <AvatarAdapter status="IDLE" mood="calm" :variant="c.avatarStyle" :palette="c.palette" :label="nameOf(c)" />
              </span>
              <span class="card-name">{{ nameOf(c) }}</span>
              <span class="card-level">{{ strings.level(c.level || 1) }}</span>
            </button>
            <!-- 刪除：只剩一隻的時候不能刪 -->
            <button
              v-if="characters.length > 1"
              type="button"
              class="card-delete"
              :aria-label="strings.deleteLabel(nameOf(c))"
              :title="strings.deleteLabel(nameOf(c))"
              @click="startDelete(c)"
            >
              🗑
            </button>
          </div>
          <button v-if="characters.length < maxCharacters" type="button" class="card card-add" @click="startAdd">
            <span class="plus" aria-hidden="true">＋</span>
            <span class="card-name">{{ strings.add }}</span>
          </button>
        </div>
      </template>

      <!-- 刪除角色：再輸入一次密碼確認。資料不會直接刪掉，後端搬到 backups/deleted-characters/ -->
      <form v-else-if="deleting" class="add-form delete-form" @submit.prevent="confirmDelete">
        <h2 class="picker-title">{{ strings.deleteTitle(nameOf(deleting)) }}</h2>
        <span class="preview" aria-hidden="true">
          <AvatarAdapter status="SLEEPY" mood="sad" :variant="deleting.avatarStyle" :palette="deleting.palette" :label="nameOf(deleting)" />
        </span>
        <p class="delete-hint">{{ strings.deleteHint }}</p>
        <PinField v-model="pin" :label="strings.pinLabel" @enter="confirmDelete" />
        <p v-if="error" class="picker-error" role="alert">{{ error }}</p>
        <div class="form-actions">
          <button type="button" class="btn-secondary" @click="deleting = null">{{ strings.cancel }}</button>
          <button type="submit" class="btn-danger" :disabled="saving || pin.length !== 4">{{ strings.deleteConfirm }}</button>
        </div>
      </form>

      <form v-else class="add-form" @submit.prevent="create">
        <h2 class="picker-title">{{ strings.newTitle }}</h2>
        <span class="preview" aria-hidden="true">
          <AvatarAdapter status="HAPPY" mood="joy" :variant="form.avatarStyle" :palette="form.palette" :label="form.name || defaultName" />
        </span>
        <label class="field">
          <span>{{ strings.nameLabel }}</span>
          <input
            ref="nameEl"
            v-model="form.name"
            type="text"
            :placeholder="strings.namePlaceholder"
            :maxlength="limits.companionName ?? undefined"
          />
        </label>
        <div class="field">
          <span id="new-lang-label">{{ strings.languageLabel }}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="new-lang-label">
            <button
              v-for="opt in ['zh', 'ja']"
              :key="opt"
              type="button"
              role="radio"
              :aria-checked="form.language === opt"
              :class="{ active: form.language === opt }"
              @click="form.language = opt"
            >
              {{ opt === 'zh' ? '中文' : '日本語' }}
            </button>
          </div>
        </div>
        <div class="field">
          <span id="new-style-label">{{ strings.styleLabel }}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="new-style-label">
            <button
              v-for="opt in ['full', 'classic']"
              :key="opt"
              type="button"
              role="radio"
              :aria-checked="form.avatarStyle === opt"
              :class="{ active: form.avatarStyle === opt }"
              @click="form.avatarStyle = opt"
            >
              {{ opt === 'full' ? styleNames.full : styleNames.classic }}
            </button>
          </div>
        </div>
        <PaletteChooser v-model="form.palette" :label="strings.paletteLabel" :names="paletteNames" />
        <p v-if="error" class="picker-error" role="alert">{{ error }}</p>
        <div class="form-actions">
          <button type="button" class="btn-secondary" @click="adding = false">{{ strings.cancel }}</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ strings.create }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue';
import AvatarAdapter from './AvatarAdapter.vue';
import PaletteChooser from './PaletteChooser.vue';
import PinField from './PinField.vue';
import { pinErrorMessage } from '../pinErrors.js';
import { limits } from '../limits.js';

const props = defineProps({
  strings: { type: Object, required: true },
  styleNames: { type: Object, required: true }, // { full, classic }
  paletteNames: { type: Object, required: true },
  defaultName: { type: String, default: 'PokkaTomo' },
  currentId: { type: String, default: null },
  language: { type: String, default: 'zh' },
  lockStrings: { type: Object, default: () => ({}) } // t.lock：密碼錯誤的訊息
});
const emit = defineEmits(['select', 'deleted']);

const maxCharacters = 12; // 跟後端 characterService.MAX_CHARACTERS 一樣；超過後端也會擋
const characters = ref([]);
const adding = ref(false);
const saving = ref(false);
const error = ref('');
const nameEl = ref(null);
const form = reactive({ name: '', avatarStyle: 'full', palette: 'peach', language: 'zh' });

const nameOf = (c) => c.name?.trim() || props.defaultName;

async function load() {
  try {
    const res = await fetch('/api/characters');
    if (!res.ok) throw new Error();
    characters.value = (await res.json()).characters || [];
    error.value = '';
  } catch {
    error.value = props.strings.loadFailed;
  }
}

function startAdd() {
  // 新角色預設挑一個還沒人用的毛色，比較好分
  const used = new Set(characters.value.map((c) => c.palette));
  form.name = '';
  form.avatarStyle = 'full';
  form.palette = ['peach', 'cocoa', 'mint', 'sakura', 'cream', 'gray'].find((p) => !used.has(p)) || 'peach';
  error.value = '';
  form.language = props.language === 'ja' ? 'ja' : 'zh'; // 預設選在畫面目前的語言，使用者可以改
  adding.value = true;
  nextTick(() => nameEl.value?.focus());
}

async function create() {
  saving.value = true;
  try {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 語言由使用者在表單上選；其他設定（稱呼＝主人、喜好、紀念日…）後端一律用預設值，不複製別的角色
      body: JSON.stringify({ name: form.name.trim(), avatarStyle: form.avatarStyle, palette: form.palette, language: form.language })
    });
    if (!res.ok) throw new Error();
    const { character } = await res.json();
    adding.value = false;
    emit('select', { ...character, level: 1 });
  } catch {
    error.value = props.strings.createFailed;
  } finally {
    saving.value = false;
  }
}

// ---- 刪除角色 ----
const deleting = ref(null);
const pin = ref('');
function startDelete(c) {
  deleting.value = c;
  pin.value = '';
  error.value = '';
}
async function confirmDelete() {
  if (!deleting.value || pin.value.length !== 4 || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await fetch(`/api/characters/${encodeURIComponent(deleting.value.id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin.value })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      pin.value = '';
      if (data?.error === 'last_character') error.value = props.strings.lastOne;
      else if (data?.error === 'wrong_pin' || data?.error === 'too_many_attempts') error.value = pinErrorMessage(data, props.lockStrings);
      else error.value = props.strings.deleteFailed;
      return;
    }
    const id = deleting.value.id;
    deleting.value = null;
    await load();
    emit('deleted', id);
  } catch {
    error.value = props.strings.deleteFailed;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
defineExpose({ reload: load });
</script>

<style scoped>
.picker-screen {
  position: fixed;
  inset: 0;
  z-index: 90;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: 32px 16px;
  background: linear-gradient(160deg, #fff4e3 0%, #ffe3cf 100%);
  color: #4a3a2a;
}
:global(.is-night) .picker-screen {
  background: linear-gradient(160deg, #2b2240 0%, #1d1830 100%);
  color: #f3eaff;
}
.picker-inner {
  width: min(640px, 100%);
  margin: auto 0;
}
.picker-title {
  text-align: center;
  font-size: 22px;
  margin: 0 0 18px;
}
.picker-error {
  text-align: center;
  color: #b3261e;
  font-size: 13px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 14px;
}
.card-wrap {
  position: relative;
  display: flex;
}
.card-wrap .card {
  flex: 1;
}
.card-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: #ffffffcc;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.card-delete:hover,
.card-delete:focus-visible {
  opacity: 1;
}
.delete-hint {
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
  opacity: 0.85;
}
.btn-danger {
  border: none;
  border-radius: 999px;
  padding: 9px 20px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  background: #d9534f;
  color: #fff;
}
.btn-danger:disabled {
  opacity: 0.5;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px 14px;
  border-radius: 20px;
  border: 2px solid transparent;
  background: #ffffffb3;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
}
:global(.is-night) .card {
  background: #ffffff1a;
}
.card:hover,
.card:focus-visible {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(74, 58, 42, 0.15);
  outline: none;
}
.card.current {
  border-color: #ff7a59;
}
.mini {
  width: 110px;
  height: 110px;
  pointer-events: none; /* 卡片整張可以按，角色本身的感應區不要搶 */
}
.card-name {
  font-weight: 700;
  font-size: 15px;
}
.card-level {
  font-size: 12px;
  opacity: 0.65;
}
.card-add {
  justify-content: center;
  border: 2px dashed #d8c3a5;
  background: transparent;
  min-height: 170px;
}
.plus {
  font-size: 40px;
  line-height: 1;
  color: #ff7a59;
}
.add-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(360px, 100%);
  margin: 0 auto;
}
.preview {
  width: 150px;
  height: 150px;
  align-self: center;
  pointer-events: none;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}
.field input {
  border: 1px solid #d8cdbf;
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 15px;
  font-family: inherit;
  font-weight: 400;
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
  font-family: inherit;
}
.segmented button.active {
  background: #fff;
  color: #4a3a2a;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(74, 58, 42, 0.18);
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
.btn-secondary,
.btn-primary {
  border: none;
  border-radius: 999px;
  padding: 9px 20px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
}
.btn-secondary {
  background: #eee2d2;
  color: #4a3a2a;
}
.btn-primary {
  background: #ff7a59;
  color: #fff;
}
.btn-primary:disabled {
  opacity: 0.6;
}
</style>
