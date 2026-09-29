// 天氣 API 掛掉／不回應時：聊天不能被拖慢（跟 weatherService.test.js 分開，因為快取、退避狀態是模組層級的）
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { setupTestEnv } from './helpers/env.js';

const hang = http.createServer(() => {}); // 永遠不回應
await new Promise((r) => hang.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${hang.address().port}`;
const env = setupTestEnv({ extraEnv: { WEATHER_API_BASE: base, GEOCODE_API_BASE: base } });
after(() => {
  hang.closeAllConnections?.();
  hang.close();
  env.cleanup();
});
const ws = await import('../server/weatherService.js');
const ps = await import('../server/profileService.js');
const { WEATHER_PROMPT_WAIT_MS } = await import('../server/config.js');

test('API 不回應：聊天最多多等 WEATHER_PROMPT_WAIT_MS；失敗之後退避，不再等', async () => {
  await ps.saveProfile({ location: { name: '臺北市', latitude: 25, longitude: 121 } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    let t = Date.now();
    assert.equal(await ws.getWeatherForPrompt(), null);
    const first = Date.now() - t;
    assert.ok(first >= WEATHER_PROMPT_WAIT_MS - 50 && first < WEATHER_PROMPT_WAIT_MS + 500, `第一次等了 ${first}ms`);
    // 等背景的請求逾時（5 秒）→ 進入退避
    await new Promise((r) => setTimeout(r, 5200));
    t = Date.now();
    assert.equal(await ws.getWeatherForPrompt(), null);
    assert.ok(Date.now() - t < 100, '退避期間馬上回傳');
  } finally {
    console.warn = warn;
  }
});
