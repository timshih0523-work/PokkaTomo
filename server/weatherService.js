// weatherService.js
// 天氣：讓角色知道「外面現在怎樣」，可以自然地說「今天會下雨，記得帶傘喔」「好冷，多穿一點」。
// 很多同類產品（Gatebox、Romi、Vector、ポケとも）都有天氣，這是讓陪伴感更像「活在同一個世界」的基本功。
//
// 資料來源：Open-Meteo（https://open-meteo.com），免費、不需要申請 API key，適合這種個人專案。
//   - 地名 → 經緯度：geocoding API，只在使用者於設定面板改城市時呼叫一次，結果存進 profile.location
//   - 天氣：forecast API，快取 WEATHER_CACHE_MIN 分鐘
//
// 設計原則：天氣是「加分」，絕對不能拖慢或弄壞聊天。
//   - 所有網路請求都有逾時（WEATHER_TIMEOUT_MS），失敗就當作沒有天氣資訊，不丟錯。
//   - getWeatherForPrompt() 用「先回快取、背景更新」：快取稍微舊一點也先用，
//     完全沒有快取時才等，而且最多等 WEATHER_PROMPT_WAIT_MS。

import { onCacheReset } from './lib/cacheRegistry.js';
import { getProfile } from './profileService.js';
import {
  WEATHER_API_BASE,
  GEOCODE_API_BASE,
  WEATHER_TIMEOUT_MS,
  WEATHER_CACHE_MIN,
  WEATHER_STALE_MAX_MIN,
  WEATHER_PROMPT_WAIT_MS
} from './config.js';
import { log } from './lib/logger.js';

// WMO 天氣代碼（Open-Meteo 用的）→ 描述 + emoji。描述給模型看，用中文就好（模型會照語言指示回覆）。
const WMO = {
  0: ['晴朗', '☀️'],
  1: ['大致晴朗', '🌤️'],
  2: ['多雲', '⛅'],
  3: ['陰天', '☁️'],
  45: ['起霧', '🌫️'],
  48: ['起霧（霧凇）', '🌫️'],
  51: ['毛毛雨', '🌦️'],
  53: ['毛毛雨', '🌦️'],
  55: ['較大的毛毛雨', '🌧️'],
  56: ['凍毛毛雨', '🌧️'],
  57: ['凍毛毛雨', '🌧️'],
  61: ['小雨', '🌧️'],
  63: ['下雨', '🌧️'],
  65: ['大雨', '🌧️'],
  66: ['凍雨', '🌧️'],
  67: ['凍雨', '🌧️'],
  71: ['小雪', '🌨️'],
  73: ['下雪', '🌨️'],
  75: ['大雪', '❄️'],
  77: ['霰', '🌨️'],
  80: ['陣雨', '🌦️'],
  81: ['陣雨', '🌧️'],
  82: ['強烈陣雨', '⛈️'],
  85: ['陣雪', '🌨️'],
  86: ['強烈陣雪', '❄️'],
  95: ['雷雨', '⛈️'],
  96: ['雷雨夾冰雹', '⛈️'],
  99: ['強烈雷雨夾冰雹', '⛈️']
};
export function describeWeatherCode(code) {
  const [text, emoji] = WMO[code] || ['天氣不明', '🌡️'];
  return { text, emoji };
}

async function fetchJson(url) {
  if (typeof fetch !== 'function') throw new Error('這個 Node.js 版本沒有內建 fetch（需要 18 以上）');
  const res = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 地名 → 地點。回傳第一個結果，找不到回傳 null。
 * @param {string} query 例如「台北」「大阪」「Taipei」
 * @param {string} language 'zh' | 'ja'，影響回傳地名的語言
 */
export async function geocode(query, language = 'zh') {
  const q = String(query || '').trim();
  if (!q) return null;
  const url =
    `${GEOCODE_API_BASE}/v1/search?name=${encodeURIComponent(q)}` +
    `&count=1&language=${language === 'ja' ? 'ja' : 'zh'}&format=json`;
  const data = await fetchJson(url);
  const r = data?.results?.[0];
  if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return null;
  return {
    query: q,
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    latitude: r.latitude,
    longitude: r.longitude
  };
}

function summarizeDay(daily, i) {
  if (!daily?.time?.[i]) return null;
  return {
    date: daily.time[i],
    ...describeWeatherCode(daily.weather_code?.[i]),
    max: Math.round(daily.temperature_2m_max?.[i]),
    min: Math.round(daily.temperature_2m_min?.[i]),
    rainChance: daily.precipitation_probability_max?.[i] ?? null
  };
}

// 接下來每小時的天氣（給右上角天氣按鈕打開的「每小時天氣」用）。
// Open-Meteo 的 hourly.time 是「當地時間」字串（timezone=auto），例如 '2026-09-28T14:00'；
// current.time 也是當地時間，所以直接比字串就能找到「現在這個小時」，不用管時區換算。
// 多存 3 小時：快取最多可能舊到 3 小時（WEATHER_STALE_MAX_MIN），前端用 ts 把已經過去的小時濾掉後還夠 24 小時。
export const HOURLY_COUNT = 24;
const HOURLY_KEEP = HOURLY_COUNT + 3;
export function summarizeHourly(hourly, currentTime, utcOffsetSeconds = 0) {
  const times = hourly?.time;
  if (!Array.isArray(times) || !times.length) return [];
  const nowHour = typeof currentTime === 'string' ? `${currentTime.slice(0, 13)}:00` : null;
  let start = nowHour ? times.findIndex((t) => t >= nowHour) : 0;
  if (start < 0) start = 0;
  const out = [];
  for (let i = start; i < times.length && out.length < HOURLY_KEEP; i++) {
    const code = hourly.weather_code?.[i];
    const isDay = hourly.is_day?.[i] !== 0;
    let { text, emoji } = describeWeatherCode(code);
    // 晚上的晴天顯示月亮，不然半夜看到一排太陽很怪
    if (!isDay && (code === 0 || code === 1)) emoji = '🌙';
    out.push({
      time: times[i],
      // 這個小時開始的絕對時間（毫秒）：當地時間字串 − 當地的 UTC 偏移
      ts: Date.parse(`${times[i]}:00Z`) - (Number(utcOffsetSeconds) || 0) * 1000,
      hour: Number(times[i].slice(11, 13)),
      text,
      emoji,
      temp: Math.round(hourly.temperature_2m?.[i]),
      rainChance: hourly.precipitation_probability?.[i] ?? null
    });
  }
  return out;
}

async function fetchForecast(location) {
  const url =
    `${WEATHER_API_BASE}/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}` +
    '&current=temperature_2m,apparent_temperature,weather_code' +
    '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=2';
  const data = await fetchJson(url);
  const cur = data?.current;
  if (!cur) throw new Error('天氣資料格式不對');
  return {
    locationName: location.name,
    current: {
      ...describeWeatherCode(cur.weather_code),
      temp: Math.round(cur.temperature_2m),
      feelsLike: Math.round(cur.apparent_temperature)
    },
    today: summarizeDay(data.daily, 0),
    tomorrow: summarizeDay(data.daily, 1),
    hourly: summarizeHourly(data.hourly, cur.time, data.utc_offset_seconds),
    fetchedAt: Date.now()
  };
}

// 快取：key 是經緯度，換城市就自然換一份。
let cache = null; // { key, weather }
onCacheReset(() => (cache = null)); // 匯入備份後城市可能不一樣
let refreshing = null;
// 上次失敗的時間：沒網路的時候，不要每句話都為了天氣再等 2.5 秒，失敗後 FAILURE_BACKOFF_MS 內直接當作沒天氣。
let lastFailureAt = 0;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;

const keyOf = (loc) => `${loc.latitude},${loc.longitude}`;

function refresh(location) {
  if (refreshing) return refreshing;
  refreshing = fetchForecast(location)
    .then((weather) => {
      cache = { key: keyOf(location), weather };
      lastFailureAt = 0;
      return weather;
    })
    .catch((err) => {
      log.warn('weather_failed', { error: err.message });
      lastFailureAt = Date.now();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * 取得目前設定地點的天氣；沒設定地點或取得失敗回傳 null。
 * @param {{ maxWaitMs?: number }} [opts] 沒有可用快取時最多等多久（預設等到請求結束或逾時）
 */
export async function getWeather({ maxWaitMs } = {}) {
  const profile = await getProfile();
  const location = profile.location;
  if (!location || typeof location.latitude !== 'number') return null;

  const age = cache?.key === keyOf(location) ? Date.now() - cache.weather.fetchedAt : Infinity;
  if (age < WEATHER_CACHE_MIN * 60000) return cache.weather;

  // 最近才失敗過：先不要再試、也不要等，直接當作沒有天氣（有舊快取的話下面照樣用舊的）。
  const inBackoff = Date.now() - lastFailureAt < FAILURE_BACKOFF_MS;
  if (inBackoff) return age < WEATHER_STALE_MAX_MIN * 60000 ? cache.weather : null;

  const pending = refresh(location);
  // 快取有點舊但還能用（例如 2 小時內）：先回舊的，新的在背景抓。
  if (age < WEATHER_STALE_MAX_MIN * 60000) return cache.weather;

  if (maxWaitMs == null) return pending;
  return Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve(null), maxWaitMs))]);
}

/** 給 buildSystemPrompt 用：不會讓聊天等超過 WEATHER_PROMPT_WAIT_MS。 */
export function getWeatherForPrompt() {
  return getWeather({ maxWaitMs: WEATHER_PROMPT_WAIT_MS }).catch(() => null);
}

/** 天氣 → 放進 system prompt 的一段文字。 */
export function weatherPromptLine(w) {
  if (!w) return '';
  const parts = [`使用者所在地「${w.locationName}」現在${w.current.text}，${w.current.temp}°C（體感 ${w.current.feelsLike}°C）`];
  const day = (label, d) =>
    d ? `${label}${d.text}，${d.min}～${d.max}°C${d.rainChance != null ? `，降雨機率 ${d.rainChance}%` : ''}` : '';
  const today = day('今天', w.today);
  const tomorrow = day('明天', w.tomorrow);
  if (today) parts.push(today);
  if (tomorrow) parts.push(tomorrow);
  return (
    `天氣：${parts.join('；')}。` +
    '適合的時候可以自然地提醒（例如會下雨提醒帶傘、很冷提醒保暖），但不要每句話都講天氣，對方沒興趣就別提。'
  );
}
