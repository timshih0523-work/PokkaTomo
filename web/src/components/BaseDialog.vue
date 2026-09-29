<!--
  BaseDialog.vue — 設定面板、日記面板共用的「蓋在畫面上的對話框」外殼。

  集中處理每個對話框都要有、而且很容易某一個忘記做的東西：
    - 半透明背景，點背景關閉；右上角 ✕（aria-label 由呼叫端傳在地化文字）
    - Esc 關閉（只在打開時監聽）
    - role="dialog" + aria-modal + aria-labelledby，打開時焦點移進對話框
  內容用 slot：預設 slot 是本體，#footer 是底部按鈕列。

  焦點：預設移到對話框裡第一個可以輸入/點的元素；呼叫端要指定的話傳 initialFocus（模板裡的元素 ref）。
-->
<template>
  <Transition name="panel-fade">
    <div v-if="open" class="dialog-backdrop" @click.self="$emit('close')">
      <div ref="cardEl" class="dialog-card" role="dialog" aria-modal="true" :aria-labelledby="titleId">
        <div class="dialog-header">
          <h2 :id="titleId">{{ title }}</h2>
          <button type="button" class="icon-btn" @click="$emit('close')" :aria-label="closeLabel">✕</button>
        </div>
        <div class="dialog-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="dialog-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  closeLabel: { type: String, default: 'close' },
  initialFocus: { type: null, default: null }
});
const emit = defineEmits(['close']);

// 每個對話框各自一個不會重複的 id，給 aria-labelledby 指到標題用。
const titleId = `dialog-title-${Math.random().toString(36).slice(2, 10)}`;
const cardEl = ref(null);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    nextTick(() => {
      // initialFocus 傳進來時已經是 DOM 元素（模板裡的 ref 會自動解開），不是 ref 物件。
      const target =
        (props.initialFocus instanceof HTMLElement ? props.initialFocus : null) ||
        cardEl.value?.querySelector('.dialog-body input, .dialog-body textarea, .dialog-body button, .dialog-footer button');
      target?.focus();
    });
  }
);

function onKeydown(e) {
  if (e.key === 'Escape' && props.open) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(30, 20, 10, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 16px;
}

.dialog-card {
  background: #fffaf3;
  border-radius: 18px;
  width: min(420px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
  color: #4a3a2a;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 8px;
}
.dialog-header h2 {
  margin: 0;
  font-size: 17px;
}
.icon-btn {
  border: none;
  background: transparent;
  font-size: 16px;
  padding: 4px 8px;
  border-radius: 8px;
  color: inherit;
}
.icon-btn:active {
  background: #f0e5d8;
}

.dialog-body {
  overflow-y: auto;
  padding: 4px 18px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 18px 16px;
}

/* 窄畫面：改成從下面滑上來、填滿寬度的面板，比較好用手指點，也不會兩邊留一條空白。 */
@media (max-width: 520px) {
  .dialog-backdrop {
    align-items: flex-end;
    padding: 0;
  }
  .dialog-card {
    width: 100%;
    max-height: 92dvh;
    border-radius: 18px 18px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.18s ease;
}
.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}
</style>
