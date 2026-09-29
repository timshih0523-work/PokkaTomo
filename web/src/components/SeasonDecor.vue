<!--
  SeasonDecor.vue — 節日裝飾：依今天的節日（後端 /api/companion 的 events，見 server/lib/seasons.js）
  顯示飄落的東西、角落的小裝飾，跟一個寫著節日名稱的小標籤。角色頭上的配件（聖誕帽等）
  由 App.vue 依同一份 events 傳給 AvatarAdapter。
  沒有節日的日子什麼都不顯示。
-->
<template>
  <template v-if="events.length">
    <ParticleLayer v-if="particleKind" :kind="particleKind" :count="particleKind === 'star' ? 18 : 14" />
    <div v-if="corner" class="season-corner" aria-hidden="true">{{ corner }}</div>
    <p class="season-pill">{{ labels.join('・') }}</p>
  </template>
</template>

<script setup>
import { computed } from 'vue';
import ParticleLayer from './ParticleLayer.vue';

const props = defineProps({
  // ['christmas', ...]
  events: { type: Array, default: () => [] },
  // i18n 的 events 字典：id → 顯示名稱（含 emoji）
  names: { type: Object, required: true }
});

// 同一天有好幾個節日時，以排在前面的為主決定飄什麼。
const PARTICLES = {
  sakura: 'petal',
  christmasEve: 'snow',
  christmas: 'snow',
  valentine: 'heart',
  whiteDay: 'heart',
  qixi: 'heart',
  tanabata: 'star',
  midAutumn: 'star',
  newYear: 'confetti',
  lunarNewYear: 'confetti',
  yearEnd: 'confetti',
  halloween: 'bat'
};
const CORNERS = {
  christmasEve: '🎄',
  christmas: '🎄',
  newYear: '🎍',
  lunarNewYear: '🏮',
  midAutumn: '🌕',
  tanabata: '🎋',
  hinamatsuri: '🎎',
  halloween: '🎃',
  dragonBoat: '🐲'
};

const particleKind = computed(() => props.events.map((id) => PARTICLES[id]).find(Boolean) || null);
const corner = computed(() => props.events.map((id) => CORNERS[id]).find(Boolean) || null);
const labels = computed(() => props.events.map((id) => props.names[id]).filter(Boolean));
</script>

<style scoped>
.season-corner {
  position: fixed;
  right: clamp(8px, 3vw, 32px);
  bottom: clamp(8px, 3vh, 28px);
  font-size: clamp(34px, 6vw, 56px);
  opacity: 0.9;
  pointer-events: none;
  z-index: 0;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.12));
}
.season-pill {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: #ffffffcc;
  color: #a5502f;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}
</style>
