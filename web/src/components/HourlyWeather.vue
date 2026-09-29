<!--
  HourlyWeather.vue — 每小時天氣（按右上角的天氣徽章打開／再按一次收起）。
  資料來自 GET /api/weather 的 weather.hourly（server/weatherService.js 的 summarizeHourly）。
  伺服器的天氣快取最多可能舊到 3 小時，所以這裡用每一格的 ts 把「已經過去的小時」濾掉，只顯示接下來 24 小時。
  橫向捲動；降雨機率 20% 以上才顯示水滴，避免一整排數字很吵。
-->
<template>
  <div class="hourly-panel" role="region" :aria-label="strings.title(weather.locationName)">
    <div class="hourly-head">
      <strong>{{ strings.title(weather.locationName) }}</strong>
      <span v-if="weather.today" class="hourly-today">
        {{ weather.today.emoji }} {{ strings.today(weather.today.max, weather.today.min) }}
      </span>
    </div>
    <ol v-if="hours.length" class="hourly-strip">
      <li
        v-for="(h, i) in hours"
        :key="h.time"
        class="hour"
        :class="{ 'is-now': i === 0, 'new-day': i > 0 && h.hour === 0 }"
        :title="h.rainChance != null ? `${h.text}・${strings.rain(h.rainChance)}` : h.text"
      >
        <span class="hour-label">{{ i === 0 ? strings.now : h.hour === 0 ? strings.tomorrow : strings.hour(h.hour) }}</span>
        <span class="hour-emoji" aria-hidden="true">{{ h.emoji }}</span>
        <span class="hour-temp">{{ h.temp }}°</span>
        <span class="hour-rain" :class="{ invisible: !(h.rainChance >= 20) }">💧{{ h.rainChance ?? 0 }}%</span>
      </li>
    </ol>
    <p v-else class="hourly-empty">{{ strings.empty }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { upcomingHours } from '../weatherHours.js';

const props = defineProps({
  weather: { type: Object, required: true },
  strings: { type: Object, required: true },
  // 給測試／重新整理用；平常是現在時間
  now: { type: Number, default: () => Date.now() }
});

const hours = computed(() => upcomingHours(props.weather.hourly, props.now));
</script>

<style scoped>
.hourly-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  width: min(92vw, 440px);
  background: #fffaf3f2;
  border: 1px solid #eadcc8;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(74, 58, 42, 0.16);
  padding: 10px 12px 8px;
  color: #4a3a2a;
  backdrop-filter: blur(6px);
}
.hourly-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 6px;
}
.hourly-today {
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
}
.hourly-strip {
  list-style: none;
  margin: 0;
  padding: 2px 0 6px;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}
.hour {
  flex: none;
  width: 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0;
  border-radius: 12px;
  scroll-snap-align: start;
}
.hour.is-now {
  background: #ffe8cc;
  font-weight: 700;
}
.hour.new-day {
  border-left: 1px dashed #d8c3a5;
  border-radius: 0 12px 12px 0;
}
.hour-label {
  font-size: 11px;
  opacity: 0.75;
}
.hour-emoji {
  font-size: 20px;
  line-height: 1.2;
}
.hour-temp {
  font-size: 13px;
  font-weight: 600;
}
.hour-rain {
  font-size: 10px;
  color: #2f6fb3;
}
.hour-rain.invisible {
  visibility: hidden;
}
.hourly-empty {
  font-size: 12px;
  opacity: 0.7;
  margin: 4px 0;
}
/* 窄螢幕：天氣按鈕不在最右邊，面板改成貼齊畫面左右，才不會被切到畫面外 */
@media (max-width: 560px) {
  .hourly-panel {
    position: fixed;
    top: 60px;
    left: 12px;
    right: 12px;
    width: auto;
  }
}
.is-night .hourly-panel {
  background: #2d2440f2;
  border-color: #4a3d66;
  color: #f3eaff;
}
.is-night .hour.is-now {
  background: #4a3d66;
}
.is-night .hour-rain {
  color: #9cc7ff;
}
</style>
