<!--
  ParticleLayer.vue — 從畫面上方飄下來的小東西（純 CSS 動畫，不吃資源）。
  季節裝飾（櫻花瓣、雪、愛心…，見 SeasonDecor.vue）跟升級慶祝的彩帶共用這一個元件。

  props：
    kind   'petal' | 'snow' | 'heart' | 'confetti' | 'star' | 'bat'
    count  幾片
    loop   true = 一直飄（季節裝飾）；false = 飄一輪就停（慶祝）
  使用者系統設定了「減少動態效果」時完全不顯示。
-->
<template>
  <div class="particle-layer" :class="[`kind-${kind}`, { once: !loop }]" aria-hidden="true">
    <span
      v-for="p in particles"
      :key="p.id"
      class="particle"
      :style="{
        left: p.left + '%',
        animationDelay: p.delay + 's',
        animationDuration: p.duration + 's',
        fontSize: p.size + 'px',
        '--drift': p.drift + 'px',
        '--spin': p.spin + 'deg',
        color: p.color
      }"
    >{{ p.glyph }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  kind: { type: String, required: true },
  count: { type: Number, default: 14 },
  loop: { type: Boolean, default: true }
});

const GLYPHS = {
  petal: ['🌸', '❀'],
  snow: ['❄', '❅', '•'],
  heart: ['♥', '♡'],
  confetti: ['■', '●', '▲', '★'],
  star: ['✦', '✧', '⋆'],
  bat: ['🦇']
};
const COLORS = {
  petal: ['#ffb7d0', '#ff9dbf'],
  snow: ['#ffffff', '#e6f2ff'],
  heart: ['#ff7eb6', '#ff9dbf', '#ffb3c7'],
  confetti: ['#ff7a59', '#ffc93c', '#7fdcc0', '#6fa8ff', '#ff7eb6', '#b18cff'],
  star: ['#fff4b0', '#ffe27a'],
  bat: ['#4a2f73']
};

// 位置、速度、大小每片都不一樣，才不會看起來像整齊的一排。算一次就好（不要每次重新渲染都變）。
const particles = computed(() => {
  const glyphs = GLYPHS[props.kind] || GLYPHS.star;
  const colors = COLORS[props.kind] || COLORS.star;
  return Array.from({ length: props.count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: props.loop ? Math.random() * 10 : Math.random() * 0.6,
    duration: props.loop ? 8 + Math.random() * 8 : 1.8 + Math.random() * 1.2,
    size: (props.kind === 'confetti' ? 8 : 12) + Math.random() * 10,
    drift: (Math.random() - 0.5) * 120,
    spin: (Math.random() - 0.5) * 720,
    glyph: glyphs[i % glyphs.length],
    color: colors[i % colors.length]
  }));
});
</script>

<style scoped>
.particle-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
}
.particle {
  position: absolute;
  top: -40px;
  opacity: 0.85;
  animation-name: fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.once .particle {
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
  animation-timing-function: ease-in;
}
.kind-star .particle {
  animation-name: twinkle;
  top: auto;
}
.kind-star .particle:nth-child(odd) { top: 8%; }
.kind-star .particle:nth-child(even) { top: 22%; }
@keyframes fall {
  0% { transform: translate(0, 0) rotate(0); opacity: 0; }
  10% { opacity: 0.9; }
  100% { transform: translate(var(--drift), 105vh) rotate(var(--spin)); opacity: 0.2; }
}
@keyframes twinkle {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.15); }
}
@media (prefers-reduced-motion: reduce) {
  .particle-layer { display: none; }
}
</style>
