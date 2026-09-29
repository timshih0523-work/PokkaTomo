import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, drainAll } from '../../server/lib/asyncQueue.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('同一個 key 依序執行、不重疊（避免讀-改-寫遺失更新）', async () => {
  let running = 0;
  let maxRunning = 0;
  const order = [];
  await Promise.all(
    [30, 10, 20].map((ms, i) =>
      enqueue('k', async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await sleep(ms);
        order.push(i);
        running--;
      })
    )
  );
  assert.equal(maxRunning, 1);
  assert.deepEqual(order, [0, 1, 2]);
});

test('一個任務失敗不會卡住後面的任務，呼叫端拿到自己那次的錯誤', async () => {
  const failing = enqueue('k2', async () => {
    throw new Error('boom');
  });
  const ok = enqueue('k2', async () => 'fine');
  await assert.rejects(failing, /boom/);
  assert.equal(await ok, 'fine');
});

test('不同 key 可以同時跑', async () => {
  const start = Date.now();
  await Promise.all([enqueue('a', () => sleep(50)), enqueue('b', () => sleep(50))]);
  assert.ok(Date.now() - start < 95);
});

test('drainAll 等到排隊中的任務都做完', async () => {
  let done = false;
  enqueue('k3', async () => {
    await sleep(30);
    done = true;
  });
  await drainAll();
  assert.equal(done, true);
});
