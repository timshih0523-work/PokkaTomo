<!-- PaletteChooser.vue — 選毛色的圓形色塊（新增角色、設定面板共用）。v-model = 毛色名稱 -->
<template>
  <div class="palette-field">
    <span :id="labelId" class="palette-label">{{ label }}</span>
    <div class="swatches" role="radiogroup" :aria-labelledby="labelId">
      <button
        v-for="p in PALETTES"
        :key="p"
        type="button"
        role="radio"
        class="swatch"
        :class="{ active: modelValue === p }"
        :aria-checked="modelValue === p"
        :aria-label="names[p] || p"
        :title="names[p] || p"
        :style="{ background: `linear-gradient(160deg, ${PALETTE_COLORS[p].top}, ${PALETTE_COLORS[p].bottom})`, borderColor: PALETTE_COLORS[p].line }"
        @click="$emit('update:modelValue', p)"
      ></button>
    </div>
  </div>
</template>

<script setup>
import { PALETTES, PALETTE_COLORS } from '../palettes.js';

defineProps({
  modelValue: { type: String, default: 'peach' },
  label: { type: String, default: '' },
  names: { type: Object, default: () => ({}) }
});
defineEmits(['update:modelValue']);
const labelId = `pal-${Math.random().toString(36).slice(2, 7)}`;
</script>

<style scoped>
.palette-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.palette-label {
  font-weight: 600;
}
.swatches {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s;
}
.swatch.active {
  outline: 3px solid #ff7a59;
  outline-offset: 2px;
  transform: scale(1.08);
}
</style>
