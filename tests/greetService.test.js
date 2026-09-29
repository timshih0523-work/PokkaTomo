import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'fs';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
after(() => env.cleanup());
beforeEach(() => {
  rmSync(env.dataDir, { recursive: true, force: true });
  env.setFm({ byKind: { greet: '[mood:joy] 早安呀！' } });
  env.clearFmCalls();
});
const gs = await import('../server/greetService.js');
const hs = await import('../server/historyService.js');
const cs = await import('../server/companionService.js');

const morning = new Date(2026, 9, 1, 8, 0);
const H = 3600000;

test('第一次見面：自我介紹，存進紀錄', async () => {
  const r = await gs.maybeGreet(morning);
  assert.equal(r.greeting, '早安呀！');
  assert.match(env.fmCalls()[0].message, /第一次見面/);
  const h = await hs.getAllHistory();
  assert.equal(h[0].proactive, '2026-10-01:morning');
});

test('同一個時段只打一次招呼；下一個時段可以再打', async () => {
  await gs.maybeGreet(morning);
  assert.equal(await gs.maybeGreet(new Date(2026, 9, 1, 10, 0)), null);
  assert.ok(await gs.maybeGreet(new Date(2026, 9, 1, 13, 0)));
});

test('同時兩個分頁打開：只產生一次', async () => {
  env.setFm({ byKind: { greet: '[mood:joy] 嗨' }, delayMs: 150 });
  const [a, b] = await Promise.all([gs.maybeGreet(morning), gs.maybeGreet(morning)]);
  assert.deepEqual(a, b);
  assert.equal(env.fmCalls().length, 1);
});

test('剛剛才聊過天：不插話', async () => {
  env.writeHistory( [{ role: 'user', content: 'hi', ts: morning.getTime() - 5 * 60000 }]);
  assert.equal(await gs.maybeGreet(morning), null);
});

test('睡著的時候不打招呼', async () => {
  await cs.recordChat({ ritual: 'goodnight', now: new Date(2026, 9, 1, 1, 0).getTime() });
  assert.equal(await gs.maybeGreet(new Date(2026, 9, 1, 3, 0)), null);
});

test('好幾天沒來：先說想你了', async () => {
  env.writeHistory( [{ role: 'user', content: 'hi', ts: morning.getTime() - 3 * 24 * H }]);
  const r = await gs.maybeGreet(morning);
  assert.equal(r.missedDays, 3);
  assert.match(env.fmCalls()[0].message, /3 天沒有聊天/);
});

test('出門回來：歡迎回來；問候失敗時不會把出門狀態吃掉', async () => {
  const t = morning.getTime();
  env.writeHistory( [{ role: 'user', content: '我出門了', ts: t - 3 * H }]);
  env.writeChar('state.json', { leftAt: t - 3 * H });
  env.setFm({ fail: 'boom', failKinds: ['greet'] });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await gs.maybeGreet(morning), null);
  } finally {
    console.warn = warn;
  }
  assert.ok((await cs.getState()).leftAt, '失敗時保留');
  env.setFm({ byKind: { greet: '[mood:joy] 歡迎回來！' } });
  const r = await gs.maybeGreet(morning);
  assert.equal(r.welcomeBack, true);
  assert.match(env.fmCalls().at(-1).message, /3 小時前說要出門/);
  assert.equal((await cs.getState()).leftAt, null, '成功之後才清掉');
});
