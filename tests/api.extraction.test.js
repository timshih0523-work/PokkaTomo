// 背景的關鍵記憶提取：只對有內容的訊息跑（短訊息、生活儀式不跑，省 Mac 的資源）。
// 另外一個檔案，因為要把 DISABLE_FACT_EXTRACTION 關掉（其他測試都是關掉記憶提取的）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv({ extraEnv: { DISABLE_FACT_EXTRACTION: '' } });
const { createApp } = await import('../server/app.js');

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

const chat = (message) =>
  fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
const extractCalls = () => env.fmCalls().filter((c) => c.kind === 'extract').length;
const settle = () => new Promise((r) => setTimeout(r, 400));

test('短訊息、生活儀式：不跑記憶提取', async () => {
  env.setFm({ byKind: { extract: '{"preferences":[],"anniversaries":[]}' } });
  for (const m of ['嗯嗯', '好啊', '晚安', 'おはよう']) await chat(m);
  await settle();
  assert.equal(extractCalls(), 0);
});

test('有內容的訊息：跑記憶提取，學到的喜好寫進設定', async () => {
  env.setFm({ byKind: { extract: '{"preferences":["草莓蛋糕"],"anniversaries":[]}' } });
  await chat('我最喜歡吃草莓蛋糕了');
  await settle();
  assert.equal(extractCalls(), 1);
  assert.deepEqual(env.readChar('user.json').preferences, ['草莓蛋糕']);
});
