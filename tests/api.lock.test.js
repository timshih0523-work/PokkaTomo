// 四位數密碼鎖
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
const { createApp } = await import('../server/app.js');
const lock = await import('../server/lockService.js');

let server;
let base;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  env.cleanup();
});

const call = (p, { body, token } = {}) =>
  fetch(base + p, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-PokkaTomo-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
const json = async (p, o) => {
  const r = await call(p, o);
  return { status: r.status, ...(await r.json()) };
};

let token;

test('還沒設定密碼：不擋，status 說沒有密碼', async () => {
  assert.deepEqual(await json('/api/lock/status'), { status: 200, hasPin: false, unlocked: false });
  assert.equal((await call('/api/profile')).status, 200);
});

test('設定密碼：只能 4 位數字；存的是雜湊不是明碼；設定後不能再用 setup', async () => {
  assert.equal((await call('/api/lock/setup', { body: { pin: '12a4' } })).status, 400);
  assert.equal((await call('/api/lock/setup', { body: { pin: '12345' } })).status, 400);
  const r = await json('/api/lock/setup', { body: { pin: '2580' } });
  assert.equal(r.status, 200);
  token = r.token;
  const sec = readFileSync(path.join(env.dataDir, 'app', 'security.json'), 'utf-8');
  assert.ok(!sec.includes('2580'));
  assert.equal((await call('/api/lock/setup', { body: { pin: '1111' } })).status, 409);
});

test('有密碼之後：沒帶 token 讀不到資料；健康檢查、設定值還是可以', async () => {
  const r = await json('/api/profile');
  assert.equal(r.status, 401);
  assert.equal(r.error, 'locked');
  assert.equal((await call('/api/history/day')).status, 401);
  assert.equal((await call('/api/export')).status, 401);
  assert.equal((await call('/api/health')).status, 200);
  assert.equal((await call('/api/config')).status, 200);
  assert.equal((await call('/api/profile', { token })).status, 200);
});

test('解鎖：錯的會說還剩幾次；對的拿到新 token；上鎖後舊 token 失效', async () => {
  const wrong = await json('/api/lock/unlock', { body: { pin: '0000' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.error, 'wrong_pin');
  assert.equal(wrong.attemptsLeft, 4);
  const ok = await json('/api/lock/unlock', { body: { pin: '2580' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(await json('/api/lock/status', { token: ok.token }), { status: 200, hasPin: true, unlocked: true });
  await call('/api/lock/lock', { body: {}, token: ok.token });
  assert.equal((await call('/api/profile', { token: ok.token })).status, 401);
});

test('連續輸錯 5 次要等；等待期間連正確的也不行', async () => {
  let r;
  for (let i = 0; i < 5; i++) r = await json('/api/lock/unlock', { body: { pin: '9999' } });
  assert.equal(r.status, 429);
  assert.equal(r.error, 'too_many_attempts');
  assert.ok(r.retryAfterSec > 0);
  assert.equal((await call('/api/lock/unlock', { body: { pin: '2580' } })).status, 429);
  lock._resetLockState();
});

test('改密碼：要帶 token＋目前的密碼；改完舊密碼不能用', async () => {
  token = (await json('/api/lock/unlock', { body: { pin: '2580' } })).token;
  assert.equal((await call('/api/lock/change', { body: { current: '2580', next: '1234' } })).status, 401, '沒 token');
  assert.equal((await json('/api/lock/change', { body: { current: '0000', next: '1234' }, token })).error, 'wrong_pin');
  assert.equal((await call('/api/lock/change', { body: { current: '2580', next: '12' }, token })).status, 400);
  assert.equal((await call('/api/lock/change', { body: { current: '2580', next: '1234' }, token })).status, 200);
  assert.equal((await call('/api/lock/unlock', { body: { pin: '2580' } })).status, 401);
  assert.equal((await call('/api/lock/unlock', { body: { pin: '1234' } })).status, 200);
});

test('token 太久沒用會失效', () => {
  lock._resetLockState();
  const now = Date.now();
  assert.equal(lock.validateSession('nope'), false);
  assert.equal(lock.validateSession(undefined), false);
  // 用 unlock 流程以外的方式測過期：直接拿一組新 token，再用未來的時間驗證
  return lock.unlock('1234').then((t) => {
    assert.equal(lock.validateSession(t, now + 1000), true);
    assert.equal(lock.validateSession(t, now + 1000 + lock.SESSION_IDLE_MS + 1), false);
  });
});
