<!--
  WardrobePanel.vue — 衣櫥（上方 👗 按鈕打開）。每個角色自己的穿搭，存在 character.json 的 outfit。
  由上而下：試穿中的樣子 → 部位頁籤（頭／脖子／衣服／臉）→ 這個部位的選項（自動、不戴、每一件）。
  點選項只是「試穿」（上面的預覽跟著變）；按「就穿這樣」才存（POST /api/profile { outfit }），
  App.vue 收到 saved 之後讓角色說一句話。
  選項是小小的角色本人穿上那件的樣子，一眼就看得出是什麼。規則與清單見 web/src/outfits.js。
  舊版圓圓的樣子畫不出衣服：顯示提醒（預覽還是用全身的樣子）。
-->
<template>
  <BaseDialog :open="open" :title="strings.title" :close-label="strings.close" @close="$emit('close')">
    <div class="preview" aria-hidden="true">
      <AvatarAdapter status="HAPPY" mood="joy" variant="full" :palette="palette" :outfit="previewWorn" :label="companionName" />
    </div>
    <p v-if="avatarStyle === 'classic'" class="note">{{ strings.classicNote }}</p>

    <div class="tabs" role="tablist" :aria-label="strings.title">
      <button
        v-for="s in WARDROBE_SLOTS"
        :key="s"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: slot === s }"
        :aria-selected="slot === s"
        @click="slot = s"
      >
        {{ strings.slots[s] }}
      </button>
    </div>

    <div class="grid" role="radiogroup" :aria-label="strings.slots[slot]">
      <button
        v-for="opt in options"
        :key="opt"
        type="button"
        role="radio"
        class="item"
        :class="{ selected: draft[slot] === opt }"
        :aria-checked="draft[slot] === opt"
        @click="draft[slot] = opt"
      >
        <span class="mini" aria-hidden="true">
          <AvatarAdapter status="IDLE" mood="calm" variant="full" :palette="palette" :outfit="wornWith(opt)" :label="companionName" />
        </span>
        <span class="item-name">{{ optionName(opt) }}</span>
      </button>
    </div>
    <p class="hint">{{ strings.autoHint }}</p>
    <p v-if="error" class="error" role="alert">⚠️ {{ error }}</p>

    <template #footer>
      <button type="button" class="btn-secondary" @click="reset">{{ strings.resetAll }}</button>
      <button type="button" class="btn-primary" :disabled="saving || !changed" @click="save">
        {{ saving ? strings.saving : strings.save }}
      </button>
    </template>
  </BaseDialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import BaseDialog from './BaseDialog.vue';
import AvatarAdapter from './AvatarAdapter.vue';
import { WARDROBE_SLOTS, WARDROBE_ITEMS, DEFAULT_OUTFIT, sanitizeOutfit, resolveOutfit } from '../outfits.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  strings: { type: Object, required: true },
  outfit: { type: Object, default: null }, // 現在存著的設定
  events: { type: Array, default: () => [] }, // 今天的節日（「自動」會戴節日配件）
  palette: { type: String, default: 'peach' },
  avatarStyle: { type: String, default: 'full' },
  companionName: { type: String, default: '' }
});
const emit = defineEmits(['close', 'saved']);

const slot = ref('head');
const draft = reactive({ ...DEFAULT_OUTFIT });
const saving = ref(false);
const error = ref('');

// 每次打開都從現在存著的設定開始
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    Object.assign(draft, sanitizeOutfit(props.outfit));
    error.value = '';
  },
  { immediate: true }
);

const saved = computed(() => sanitizeOutfit(props.outfit));
const changed = computed(() => WARDROBE_SLOTS.some((s) => draft[s] !== saved.value[s]));
const options = computed(() => ['auto', 'none', ...WARDROBE_ITEMS[slot.value]]);

const resolve = (o) => resolveOutfit(o, { events: props.events, date: new Date() });
const previewWorn = computed(() => resolve(draft));
// 小圖：其他部位照現在試穿的，只換這個部位
const wornWith = (opt) => resolve({ ...draft, [slot.value]: opt });

function optionName(opt) {
  if (opt === 'auto') return props.strings.auto;
  if (opt === 'none') return props.strings.none;
  return props.strings.items[opt] || opt;
}

function reset() {
  Object.assign(draft, DEFAULT_OUTFIT);
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outfit: { ...draft } })
    });
    if (!res.ok) throw new Error();
    emit('saved', await res.json());
  } catch {
    error.value = props.strings.saveFailed;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.preview {
  width: 140px;
  height: 140px;
  margin: 0 auto 4px;
}
.note {
  font-size: 13px;
  background: #fff4e6;
  border-radius: 8px;
  padding: 6px 10px;
  margin: 0 0 8px;
}
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.tab {
  flex: 1;
  min-width: 64px;
  border: 1px solid #e3d6c4;
  background: #fffaf3;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 14px;
}
.tab.active {
  background: #ff8a5c;
  border-color: #ff8a5c;
  color: #fff;
  font-weight: 700;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 8px;
}
.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: 2px solid #efe3d3;
  background: #fff;
  border-radius: 14px;
  padding: 6px 4px 8px;
  font-size: 12px;
  cursor: pointer;
}
.item.selected {
  border-color: #ff8a5c;
  background: #fff1e6;
}
.mini {
  width: 64px;
  height: 64px;
  pointer-events: none;
}
.item-name {
  line-height: 1.3;
  text-align: center;
}
.hint {
  font-size: 12px;
  color: #8a6d52;
  margin: 10px 0 0;
}
.error {
  color: #b3261e;
  font-size: 13px;
}
.btn-primary,
.btn-secondary {
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 14px;
  border: none;
}
.btn-primary {
  background: #ff8a5c;
  color: #fff;
  font-weight: 700;
}
.btn-primary:disabled {
  opacity: 0.5;
}
.btn-secondary {
  background: #fff;
  border: 1px solid #e3d6c4;
  color: #6b5540;
}
</style>
