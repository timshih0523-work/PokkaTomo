import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
after(() => env.cleanup());
beforeEach(() => env.resetData());
const cs = await import('../server/companionService.js');
const cfg = await import('../server/config.js');

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test('等級門檻', () => {
  const lv = (p) => cs.levelInfo(p).level;
  assert.deepEqual([0, 29, 30, 99, 100, 249, 250, 500, 999, 1000, 99999].map(lv), [1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6]);
  assert.equal(cs.levelInfo(1000).nextMin, null);
  assert.equal(cs.levelInfo(1000).progress, 1);
  assert.equal(cs.levelInfo(65).progress, 0.5);
});

test('每天第一次聊天 +3 再 +1；之後每則 +1，每天上限', async () => {
  const day = at(2026, 9, 28);
  assert.equal((await cs.recordChat({ ritual: null, now: day })).growth.points, cfg.GROWTH_FIRST_VISIT_BONUS + 1);
  for (let i = 0; i < 40; i++) await cs.recordChat({ ritual: null, now: day + i });
  const s = await cs.getState();
  assert.equal(s.points, cfg.GROWTH_FIRST_VISIT_BONUS + cfg.GROWTH_CHAT_POINT_DAILY_CAP, '訊息加分有每天上限');
  assert.equal(s.totals.messages, 41, '次數還是照算');
});

test('連續第二天來有額外加分；中間斷一天就重新算', async () => {
  await cs.recordChat({ ritual: null, now: at(2026, 9, 1) });
  const d2 = await cs.recordChat({ ritual: null, now: at(2026, 9, 2) });
  assert.equal((await cs.getState()).streak.days, 2);
  assert.equal(d2.growth.points, 4 + 3 + cfg.GROWTH_STREAK_BONUS + 1);
  await cs.recordChat({ ritual: null, now: at(2026, 9, 4) });
  assert.equal((await cs.getState()).streak.days, 1);
});

test('摸頭每天上限；升級時 levelUp=true', async () => {
  let last;
  for (let i = 0; i < 15; i++) last = await cs.recordPat(at(2026, 9, 28));
  assert.equal(last.growth.points, cfg.GROWTH_PAT_POINT_DAILY_CAP);
  assert.equal((await cs.getState()).totals.pats, 15);
  env.writeChar('state.json', { points: 29 });
  const r = await cs.recordPat(at(2026, 9, 29));
  assert.equal(r.levelUp, true);
  assert.equal(r.growth.level, 2);
});

test('說晚安：睡到隔天早上 6 點；說話就會醒', async () => {
  await cs.recordChat({ ritual: 'goodnight', now: at(2026, 9, 28, 23, 0) });
  const s = await cs.getState();
  assert.equal(cs.isAsleep(s, at(2026, 9, 29, 2, 0)), true);
  assert.equal(cs.isAsleep(s, at(2026, 9, 29, 5, 59)), true);
  assert.equal(cs.isAsleep(s, at(2026, 9, 29, 6, 0)), false);
  await cs.recordChat({ ritual: null, now: at(2026, 9, 29, 1, 0) });
  assert.equal(cs.isAsleep(await cs.getState(), at(2026, 9, 29, 2, 0)), false);
});

test('凌晨 3 點才說晚安：至少睡 4 小時（7 點才醒）', async () => {
  await cs.recordChat({ ritual: 'goodnight', now: at(2026, 9, 29, 3, 0) });
  const s = await cs.getState();
  assert.equal(cs.isAsleep(s, at(2026, 9, 29, 6, 30)), true);
  assert.equal(cs.isAsleep(s, at(2026, 9, 29, 7, 1)), false);
});

test('wakeUp 叫醒', async () => {
  await cs.recordChat({ ritual: 'goodnight', now: Date.now() });
  await cs.wakeUp();
  assert.equal(cs.isAsleep(await cs.getState()), false);
});

test('出門／回家；出門太久（忘記說回來）就不算', async () => {
  const leave = at(2026, 9, 28, 9, 0);
  await cs.recordChat({ ritual: 'leaving', now: leave });
  const s = await cs.getState();
  assert.equal(cs.awayHours(s, leave + 5 * 3600000), 5);
  assert.equal(cs.awayHours(s, leave + (cfg.AWAY_MAX_HOURS + 1) * 3600000), null);
  assert.equal(await cs.consumeAway(leave + 3600000), 1);
  assert.equal((await cs.getState()).leftAt, null, 'consume 之後清掉');
  await cs.recordChat({ ritual: 'leaving', now: leave });
  await cs.recordChat({ ritual: 'home', now: leave + 3600000 });
  assert.equal((await cs.getState()).leftAt, null);
});

test('說話風格隨等級變化；認識第幾天；常被摸頭會變得愛撒嬌', () => {
  const now = new Date(2026, 8, 28);
  const lvl1 = cs.relationshipPromptLine({ points: 0, totals: { pats: 0, messages: 0 } }, '2026-09-28', now);
  const lvl6 = cs.relationshipPromptLine({ points: 5000, totals: { pats: 0, messages: 10 } }, '2026-01-01', now);
  assert.match(lvl1, /剛認識/);
  assert.doesNotMatch(lvl1, /客氣/, '剛認識也不要生硬');
  assert.match(lvl1, /第 1 天/);
  assert.match(lvl6, /家人/);
  assert.match(lvl6, /第 271 天/);
  const cuddly = cs.relationshipPromptLine({ points: 0, totals: { pats: 60, messages: 100 } }, null, now);
  assert.match(cuddly, /撒嬌/);
});

test('壞掉或缺欄位的狀態檔不會讓程式壞掉', async () => {
  env.writeChar('state.json', { points: 10 });
  const s = await cs.getState();
  assert.equal(s.totals.messages, 0);
  assert.equal(s.streak.days, 0);
});

test('摸不同部位：分部位記次數；不認得的部位算 body', async () => {
  await cs.recordPat(at(2026, 9, 28), 'cheek');
  await cs.recordPat(at(2026, 9, 28), 'cheek');
  await cs.recordPat(at(2026, 9, 28), 'ear');
  await cs.recordPat(at(2026, 9, 28), '<script>');
  const s = await cs.getState();
  assert.deepEqual(s.totals.touches, { cheek: 2, ear: 1, body: 1 });
  assert.equal(s.totals.pats, 4);
});

test('最常被摸的部位：要夠多、而且明顯最多才算；會進到說話風格裡', () => {
  assert.equal(cs.favoriteTouch({ head: 10 }), null, '次數太少');
  assert.equal(cs.favoriteTouch({ head: 30, cheek: 25 }), null, '沒有明顯最多');
  assert.equal(cs.favoriteTouch({ head: 10, cheek: 40 }), 'cheek');
  const line = cs.relationshipPromptLine({ points: 0, totals: { pats: 0, messages: 0, touches: { cheek: 40 } } }, null, new Date());
  assert.match(line, /臉頰/);
});
