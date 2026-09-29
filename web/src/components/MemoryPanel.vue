<!--
  MemoryPanel.vue — 「{name} 記得的事」彈窗（上方 💝 按鈕打開）。
  由上而下：關鍵字搜尋 → 記憶內容。
    - 記得的喜好、紀念日（profile 裡的 preferences／anniversaries，聊天時自動記下來的，也可以在設定裡加）：
      可以改、可以刪，存檔一樣走 POST /api/profile。有輸入關鍵字時只顯示有關的。
    - 有關鍵字時，另外列出「聊過的話」：GET /api/memory/search 在永久對話封存裡找（server/routes/memory.js）。
  emit('updated', profile) 讓 App.vue 更新畫面上的 profile。
-->
<template>
  <BaseDialog :open="open" :title="strings.title" :close-label="strings.close" :initial-focus="searchEl" @close="$emit('close')">
    <!-- 關鍵字搜尋 -->
    <div class="search">
      <span class="search-icon" aria-hidden="true">🔍</span>
      <input
        ref="searchEl"
        v-model="query"
        type="search"
        class="search-input"
        :placeholder="strings.searchPlaceholder"
        :aria-label="strings.searchPlaceholder"
      />
    </div>

    <p v-if="error" class="mem-error" role="alert">⚠️ {{ error }}</p>

    <!-- 記憶內容 -->
    <section class="mem-section">
      <h3>{{ strings.preferences }}</h3>
      <p v-if="!shownPreferences.length" class="empty">{{ q ? strings.noMatch : strings.noPreferences }}</p>
      <ul v-else class="mem-list">
        <li v-for="item in shownPreferences" :key="`p-${item.index}`" class="mem-item">
          <template v-if="editing?.type === 'pref' && editing.index === item.index">
            <input v-model="editing.text" class="edit-input" :maxlength="limits.preference ?? undefined" @keydown.enter.prevent="saveEdit" />
            <button type="button" class="mini-btn ok" :disabled="saving" @click="saveEdit">{{ strings.save }}</button>
            <button type="button" class="mini-btn" @click="editing = null">{{ strings.cancel }}</button>
          </template>
          <template v-else>
            <span class="mem-text">💛 {{ item.text }}</span>
            <button type="button" class="mini-btn" :aria-label="strings.edit" :title="strings.edit" @click="startEditPref(item)">✏️</button>
            <button type="button" class="mini-btn" :aria-label="strings.forget" :title="strings.forget" :disabled="saving" @click="removePref(item.index)">🗑</button>
          </template>
        </li>
      </ul>
    </section>

    <section class="mem-section">
      <h3>{{ strings.anniversaries }}</h3>
      <p v-if="!shownAnniversaries.length" class="empty">{{ q ? strings.noMatch : strings.noAnniversaries }}</p>
      <ul v-else class="mem-list">
        <li v-for="item in shownAnniversaries" :key="`a-${item.index}`" class="mem-item">
          <template v-if="editing?.type === 'ann' && editing.index === item.index">
            <input v-model="editing.name" class="edit-input" :maxlength="limits.anniversaryName ?? undefined" />
            <input v-model="editing.date" type="date" class="edit-date" />
            <button type="button" class="mini-btn ok" :disabled="saving || !editing.name.trim() || !editing.date" @click="saveEdit">{{ strings.save }}</button>
            <button type="button" class="mini-btn" @click="editing = null">{{ strings.cancel }}</button>
          </template>
          <template v-else>
            <span class="mem-text">🎀 {{ item.name }}<span class="mem-date">{{ formatDate(item) }}</span></span>
            <button type="button" class="mini-btn" :aria-label="strings.edit" :title="strings.edit" @click="startEditAnn(item)">✏️</button>
            <button type="button" class="mini-btn" :aria-label="strings.forget" :title="strings.forget" :disabled="saving" @click="removeAnn(item.index)">🗑</button>
          </template>
        </li>
      </ul>
    </section>

    <!-- 有關鍵字時：聊過的話 -->
    <section v-if="q" class="mem-section">
      <h3>{{ strings.conversations }}</h3>
      <p v-if="searching" class="empty">{{ strings.searching }}</p>
      <p v-else-if="!conversations.length" class="empty">{{ strings.noConversations }}</p>
      <ul v-else class="conv-list">
        <li v-for="(c, i) in conversations" :key="i" class="conv-item" :class="c.role">
          <span class="conv-meta">{{ c.role === 'user' ? youLabel : companionName }}・{{ formatTs(c.ts) }}</span>
          <span class="conv-text">
            <template v-for="(part, j) in highlight(c.content)" :key="j">
              <mark v-if="part.hit">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </span>
        </li>
      </ul>
    </section>

    <p class="mem-hint">{{ strings.hint }}</p>
  </BaseDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import BaseDialog from './BaseDialog.vue';
import { limits } from '../limits.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  strings: { type: Object, required: true },
  profile: { type: Object, default: () => ({}) },
  companionName: { type: String, default: '' },
  youLabel: { type: String, default: '' },
  language: { type: String, default: 'zh' }
});
const emit = defineEmits(['close', 'updated']);

const searchEl = ref(null);
const query = ref('');
const q = computed(() => query.value.trim().toLowerCase());
const error = ref('');
const saving = ref(false);
const editing = ref(null);

// 聊天時背景會自動記下新的喜好／紀念日，畫面上的 profile 不一定是最新的 → 打開時跟伺服器拿一次
const current = ref(null);
const source = computed(() => current.value || props.profile || {});
const preferences = computed(() => (Array.isArray(source.value.preferences) ? source.value.preferences : []));
const anniversaries = computed(() => (Array.isArray(source.value.anniversaries) ? source.value.anniversaries : []));
const matches = (text) => !q.value || String(text || '').toLowerCase().includes(q.value);
const shownPreferences = computed(() =>
  preferences.value.map((text, index) => ({ text, index })).filter((p) => matches(p.text))
);
const shownAnniversaries = computed(() =>
  anniversaries.value
    .map((a, index) => ({ ...a, index }))
    .filter((a) => matches(a.name) || matches(a.date) || matches(formatDate(a)))
);

function formatDate(a) {
  const [y, m, d] = String(a.date || '').split('-').map(Number);
  if (!m || !d) return '';
  if (props.language === 'ja') return a.noYear ? `${m}月${d}日` : `${y}年${m}月${d}日`;
  return a.noYear ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}
function formatTs(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- 聊過的話（有關鍵字才找，打字停 0.3 秒再問伺服器） ----
const conversations = ref([]);
const searching = ref(false);
let searchTimer = null;
let searchSeq = 0;
watch(q, (val) => {
  clearTimeout(searchTimer);
  conversations.value = [];
  if (!val) {
    searching.value = false;
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const res = await fetch(`/api/memory/search?q=${encodeURIComponent(query.value.trim())}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (seq === searchSeq) conversations.value = data.conversations || [];
    } catch {
      if (seq === searchSeq) error.value = props.strings.searchFailed;
    } finally {
      if (seq === searchSeq) searching.value = false;
    }
  }, 300);
});

// 把關鍵字標出來（大小寫不分；繁／日漢字的對應只在伺服器端找，這裡標得到的才標）
function highlight(text) {
  const s = String(text || '');
  if (!q.value) return [{ text: s, hit: false }];
  const out = [];
  const lower = s.toLowerCase();
  let i = 0;
  for (;;) {
    const j = lower.indexOf(q.value, i);
    if (j === -1) break;
    if (j > i) out.push({ text: s.slice(i, j), hit: false });
    out.push({ text: s.slice(j, j + q.value.length), hit: true });
    i = j + q.value.length;
  }
  if (i < s.length) out.push({ text: s.slice(i), hit: false });
  return out;
}

// ---- 改／刪 ----
async function save(partial) {
  saving.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial)
    });
    if (!res.ok) throw new Error();
    const updated = await res.json();
    current.value = updated;
    emit('updated', updated);
    editing.value = null;
    return true;
  } catch {
    error.value = props.strings.saveFailed;
    return false;
  } finally {
    saving.value = false;
  }
}

function startEditPref(item) {
  editing.value = { type: 'pref', index: item.index, text: item.text };
}
function startEditAnn(item) {
  editing.value = { type: 'ann', index: item.index, name: item.name || '', date: item.date || '', noYear: !!item.noYear, origDate: item.date || '' };
}
function saveEdit() {
  const e = editing.value;
  if (!e) return;
  if (e.type === 'pref') {
    const text = e.text.trim();
    const next = preferences.value.slice();
    if (text) next[e.index] = text;
    else next.splice(e.index, 1);
    return save({ preferences: next });
  }
  if (!e.name.trim() || !e.date) return;
  const next = anniversaries.value.map((a) => ({ ...a }));
  // 沒改日期的話保留「不知道哪一年」的標記
  next[e.index] = { name: e.name.trim(), date: e.date, ...(e.noYear && e.date === e.origDate ? { noYear: true } : {}) };
  return save({ anniversaries: next });
}
function removePref(index) {
  const next = preferences.value.slice();
  next.splice(index, 1);
  return save({ preferences: next });
}
function removeAnn(index) {
  const next = anniversaries.value.map((a) => ({ ...a }));
  next.splice(index, 1);
  return save({ anniversaries: next });
}

watch(
  () => props.open,
  (o) => {
    if (!o) return;
    query.value = '';
    error.value = '';
    editing.value = null;
    conversations.value = [];
    current.value = null;
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p && props.open) {
          current.value = p;
          emit('updated', p);
        }
      })
      .catch(() => {});
  }
);
</script>

<style scoped>
.search {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0 10px;
  background: inherit;
}
.search-icon {
  font-size: 16px;
}
.search-input {
  flex: 1;
  border: 1px solid #d8cdbf;
  border-radius: 999px;
  padding: 9px 14px;
  font-size: 15px;
  font-family: inherit;
}
.mem-section {
  margin-top: 10px;
}
.mem-section h3 {
  font-size: 14px;
  margin: 0 0 6px;
}
.mem-list,
.conv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mem-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 12px;
  background: #fff4e6;
}
.mem-text {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.mem-date {
  margin-left: 8px;
  font-size: 12px;
  opacity: 0.7;
}
.mini-btn {
  border: none;
  background: #ffffffb3;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.mini-btn.ok {
  background: #ff7a59;
  color: #fff;
}
.mini-btn:disabled {
  opacity: 0.5;
}
.edit-input {
  flex: 1;
  min-width: 8em;
  border: 1px solid #d8cdbf;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 14px;
  font-family: inherit;
}
.edit-date {
  border: 1px solid #d8cdbf;
  border-radius: 8px;
  padding: 4px 6px;
  font-family: inherit;
}
.empty {
  font-size: 13px;
  opacity: 0.65;
  margin: 2px 0;
}
.conv-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 10px;
  border-radius: 12px;
  background: #f6f1ea;
  font-size: 14px;
}
.conv-item.assistant {
  background: #fff4e6;
}
.conv-meta {
  font-size: 11px;
  opacity: 0.6;
}
.conv-text {
  overflow-wrap: anywhere;
  line-height: 1.5;
}
mark {
  background: #ffe08a;
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}
.mem-error {
  color: #b3261e;
  font-size: 13px;
}
.mem-hint {
  margin-top: 14px;
  font-size: 12px;
  opacity: 0.6;
}
</style>
