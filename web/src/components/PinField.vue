<!-- PinField.vue — 重要操作前再輸入一次四位數密碼（刪除角色、匯入備份）。v-model = 輸入的數字字串 -->
<template>
  <label class="pin-confirm">
    <span class="pin-label">{{ label }}</span>
    <input
      ref="inputEl"
      :value="modelValue"
      type="password"
      inputmode="numeric"
      autocomplete="off"
      maxlength="4"
      pattern="[0-9]*"
      class="pin-input"
      @input="onInput"
      @keydown.enter.prevent="$emit('enter')"
    />
  </label>
</template>

<script setup>
import { ref, onMounted } from 'vue';

defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue', 'enter']);
const inputEl = ref(null);

function onInput(e) {
  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
  e.target.value = v;
  emit('update:modelValue', v);
}
onMounted(() => inputEl.value?.focus());
</script>

<style scoped>
.pin-confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.pin-input {
  width: 9em;
  border: 1px solid #d8cdbf;
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 22px;
  letter-spacing: 0.5em;
  font-family: inherit;
  text-align: center;
}
</style>
