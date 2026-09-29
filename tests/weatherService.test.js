import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { setupTestEnv } from './helpers/env.js';

// 假的 Open-Meteo：依官方文件的回應格式；mode 可以切成「永遠不回應」「500」
let mode = 'ok';
let forecastHits = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (mode === 'hang') return;
  if (mode === 'error') {
    res.statusCode = 500;
    return res.end('{}');
  }
  res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/v1/search') {
    if (u.searchParams.get('name') === '不存在市') return res.end(JSON.stringify({ generationtime_ms: 0.1 }));
    return res.end(JSON.stringify({ results: [{ name: '臺北市', latitude: 25.05, longitude: 121.53, country: '臺灣', admin1: '臺北市' }] }));
  }
  if (u.pathname === '/v1/forecast') {
    forecastHits++;
    return res.end(
      JSON.stringify({
        utc_offset_seconds: 28800,
        current: { time: '2026-09-28T14:15', temperature_2m: 27.6, apparent_temperature: 31.2, weather_code: 61 },
        hourly: {
          time: Array.from({ length: 48 }, (_, i) => `2026-09-${28 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`),
          temperature_2m: Array.from({ length: 48 }, (_, i) => 20 + (i % 24) / 2),
          weather_code: Array.from({ length: 48 }, (_, i) => (i % 24 < 6 || i % 24 >= 18 ? 0 : 61)),
          precipitation_probability: Array.from({ length: 48 }, (_, i) => i % 5 * 10),
          is_day: Array.from({ length: 48 }, (_, i) => (i % 24 >= 6 && i % 24 < 18 ? 1 : 0))
        },
        daily: {
          time: ['2026-09-28', '2026-09-29'],
          weather_code: [63, 1],
          temperature_2m_max: [29.4, 30.1],
          temperature_2m_min: [24.2, 24.8],
          precipitation_probability_max: [80, 10]
        }
      })
    );
  }
  res.statusCode = 404;
  res.end('{}');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const env = setupTestEnv({ extraEnv: { WEATHER_API_BASE: base, GEOCODE_API_BASE: base } });
after(() => {
  server.close();
  server.closeAllConnections?.();
  env.cleanup();
});
beforeEach(() => {
  mode = 'ok';
});
const ws = await import('../server/weatherService.js');
const ps = await import('../server/profileService.js');

test('地名 → 地點；找不到回傳 null', async () => {
  const loc = await ws.geocode('台北');
  assert.equal(loc.name, '臺北市');
  assert.equal(loc.query, '台北');
  assert.equal(await ws.geocode('不存在市'), null);
  assert.equal(await ws.geocode('   '), null);
});

test('沒設定地點 → 沒天氣', async () => {
  env.resetData();
  assert.equal(await ws.getWeather(), null);
});

test('天氣解析＋快取（30 分鐘內只打一次 API）', async () => {
  await ps.saveProfile({ location: await ws.geocode('台北') });
  const w = await ws.getWeather();
  assert.equal(w.current.temp, 28);
  assert.equal(w.current.text, '小雨');
  assert.equal(w.today.rainChance, 80);
  assert.equal(w.tomorrow.text, '大致晴朗');
  await ws.getWeather();
  await ws.getWeather();
  assert.equal(forecastHits, 1);
  // 每小時：從現在這個小時（14:00）開始，多留 3 小時
  assert.equal(w.hourly.length, 27);
  assert.equal(w.hourly[0].time, '2026-09-28T14:00');
  assert.equal(w.hourly[0].hour, 14);
  assert.equal(w.hourly[0].temp, 27);
  assert.equal(w.hourly[0].emoji, '🌧️');
  assert.equal(w.hourly[0].ts, Date.UTC(2026, 8, 28, 6), '台北 14:00 = UTC 06:00');
  const night = w.hourly.find((h) => h.hour === 22);
  assert.equal(night.emoji, '🌙', '晚上的晴天是月亮');
  assert.match(ws.weatherPromptLine(w), /降雨機率 80%/);
  assert.equal(ws.weatherPromptLine(null), '');
});

test('天氣代碼對照', () => {
  assert.equal(ws.describeWeatherCode(0).text, '晴朗');
  assert.equal(ws.describeWeatherCode(95).emoji, '⛈️');
  assert.equal(ws.describeWeatherCode(12345).text, '天氣不明');
});

test('summarizeHourly：沒有資料、沒有 current.time 時不會壞', () => {
  assert.deepEqual(ws.summarizeHourly(undefined, '2026-09-28T14:15'), []);
  const h = ws.summarizeHourly({ time: ['2026-09-28T00:00', '2026-09-28T01:00'], weather_code: [3, 3], temperature_2m: [10, 11] }, null);
  assert.equal(h.length, 2);
  assert.equal(h[0].rainChance, null);
  // current.time 比全部都晚（資料不完整）→ 從頭開始，不要回傳空的
  assert.equal(ws.summarizeHourly({ time: ['2026-09-28T00:00'], weather_code: [0] }, '2026-09-29T10:00').length, 1);
});

