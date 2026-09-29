// weatherHours.js — 每小時天氣的純邏輯（HourlyWeather.vue 用，獨立出來方便測試）

/**
 * 從伺服器給的每小時資料裡，挑出「現在這個小時」開始的接下來 count 小時。
 * 每一格的 ts 是那個小時開始的時間；ts + 1 小時 <= now 代表已經過去了。
 * @param {Array<{ ts: number }>} hourly
 * @param {number} now
 * @param {number} [count]
 */
export function upcomingHours(hourly, now = Date.now(), count = 24) {
  if (!Array.isArray(hourly)) return [];
  return hourly.filter((h) => !Number.isFinite(h?.ts) || h.ts + 3600000 > now).slice(0, count);
}
