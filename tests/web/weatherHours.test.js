import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingHours } from '../../web/src/weatherHours.js';

const H = 3600000;
const base = Date.UTC(2026, 8, 28, 6);
const hourly = Array.from({ length: 27 }, (_, i) => ({ ts: base + i * H, hour: (14 + i) % 24 }));

test('從現在這個小時開始、最多 24 小時；已經過去的小時濾掉', () => {
  const now = base + 2.5 * H; // 16:30
  const list = upcomingHours(hourly, now);
  assert.equal(list[0].hour, 16, '16:00 這一格還沒過完，算「現在」');
  assert.equal(list.length, 24);
  assert.equal(upcomingHours(hourly, base).length, 24);
  assert.equal(upcomingHours(hourly, base + 30 * H).length, 0);
});

test('沒有資料／舊格式（沒有 ts）不會壞', () => {
  assert.deepEqual(upcomingHours(undefined), []);
  assert.equal(upcomingHours([{ hour: 1 }, { hour: 2 }], Date.now()).length, 2);
});
