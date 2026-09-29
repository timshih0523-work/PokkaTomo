// 整個 API 的整合測試：用 app.js 起一個真的 Express app（隨機 port），像前端一樣打 HTTP。
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
const { createApp } = await import('../server/app.js');
const { MESSAGE_MAX_LEN } = await import('../server/config.js');

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
beforeEach(() => {
  env.resetData();
  env.setFm({});
  env.clearFmCalls();
});

const get = (p, headers = {}) => fetch(base + p, { headers });
const post = (p, body, method = 'POST') =>
  fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const chat = (message) => post('/api/chat', { message });

test('health', async () => {
  const r = await (await get('/api/health')).json();
  assert.equal(r.ok, true);
  assert.equal(r.fm.available, true);
});

test('不存在的 API → JSON 404（不是 HTML）', async () => {
  const res = await get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not_found');
});

test('Host 不是本機 → 403（擋 DNS rebinding）', async () => {
  // fetch 不允許自己設 Host 標頭（會被忽略），這裡用最底層的 http.request
  const status = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/api/history`, { headers: { Host: 'evil.example.com' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});

test('聊天：回覆、情緒、成長；情緒標籤不會出現在回覆文字裡', async () => {
  env.setFm({ reply: '[mood:sad] 辛苦了…' });
  const r = await (await chat('今天好累')).json();
  assert.equal(r.reply, '辛苦了…');
  assert.equal(r.mood, 'sad');
  assert.equal(r.ritual, null);
  assert.equal(r.growth.level, 1);
  const h = await (await get('/api/history')).json();
  assert.deepEqual(h.map((m) => m.role), ['user', 'assistant']);
});

test('聊天：驗證（空的、太長、不是文字）都是 400 bad_request', async () => {
  for (const body of [{ message: '' }, { message: '   ' }, { message: 'x'.repeat(MESSAGE_MAX_LEN + 1) }, { message: 42 }, {}]) {
    const res = await post('/api/chat', body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
    assert.equal((await res.json()).error, 'bad_request');
  }
  assert.equal((await chat('x'.repeat(MESSAGE_MAX_LEN))).status, 200, '剛好上限可以');
});

test('聊天：模型失敗 → 500 fm_error；回空白 → 也是錯誤，不會存進紀錄', async () => {
  env.setFm({ fail: 'crash' });
  const res = await chat('hi');
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'fm_error');
  env.setFm({ reply: '   ' });
  assert.equal((await chat('hi')).status, 500);
  env.setFm({ reply: '[mood:joy]' });
  assert.equal((await chat('hi')).status, 500, '只有情緒標籤也算空白');
  assert.deepEqual(await (await get('/api/history')).json(), []);
});

test('聊天：模型說上下文太長 → 不帶歷史的精簡版重試，使用者照樣拿到回覆', async () => {
  await chat('先聊一句讓紀錄有東西');
  // 有帶對話紀錄的那次回報「太長」，精簡版（不帶紀錄）成功
  env.setFm({ fail: 'Error: exceededContextWindowSize', failIfMessageIncludes: '以下是最近的對話紀錄', reply: '[mood:calm] 在喔' });
  env.clearFmCalls();
  const warn = console.warn;
  console.warn = () => {};
  try {
    const res = await chat('還在嗎');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).reply, '在喔');
  } finally {
    console.warn = warn;
  }
  const calls = env.fmCalls().filter((c) => c.kind === 'chat');
  assert.equal(calls.length, 2, '失敗後重試了一次');
  assert.equal(calls[1].message, '還在嗎', '重試時不帶歷史');
});

test('聊天：精簡版也失敗才回錯誤', async () => {
  env.setFm({ fail: 'exceededContextWindowSize' });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal((await chat('hi')).status, 500);
  } finally {
    console.warn = warn;
  }
});

test('聊天：一般錯誤（不是太長）不重試', async () => {
  env.setFm({ fail: 'model crashed' });
  env.clearFmCalls();
  await chat('hi');
  assert.equal(env.fmCalls().length, 1);
});

test('生活儀式：晚安 → 睡著；說話 → 醒來', async () => {
  const r = await (await chat('晚安～')).json();
  assert.equal(r.ritual, 'goodnight');
  assert.equal((await (await get('/api/companion')).json()).asleep, true);
  await chat('醒醒');
  assert.equal((await (await get('/api/companion')).json()).asleep, false);
});

test('history limit 參數：負數、超大、亂寫都會被限制在合理範圍', async () => {
  for (let i = 0; i < 3; i++) await chat(`m${i}`);
  assert.equal((await (await get('/api/history?limit=-5')).json()).length, 6);
  assert.equal((await (await get('/api/history?limit=2')).json()).length, 2);
  assert.equal((await (await get('/api/history?limit=abc')).json()).length, 6);
});

test('設定：存了讀得回來，壞欄位被過濾', async () => {
  const saved = await (await post('/api/profile', { nickname: '小美', preferences: ['貓', 5], hacker: 1 })).json();
  assert.equal(saved.nickname, '小美');
  assert.deepEqual(saved.preferences, ['貓']);
  assert.equal(saved.hacker, undefined);
  assert.equal((await (await get('/api/profile')).json()).nickname, '小美');
});

test('摸頭、占卜、日記、角色狀態', async () => {
  const pat = await (await post('/api/companion/pat', { part: 'cheek' })).json();
  assert.equal(pat.growth.points, 1);
  assert.equal(env.readChar('state.json').totals.touches.cheek, 1);
  await post('/api/companion/pat');
  assert.equal(env.readChar('state.json').totals.touches.body, 1, '沒給部位算 body');
  env.setFm({ byKind: { fortune: '[mood:joy] 好運！' } });
  const f1 = await (await post('/api/fortune')).json();
  const f2 = await (await post('/api/fortune')).json();
  assert.equal(f1.fresh, true);
  assert.equal(f2.fresh, false);
  const comp = await (await get('/api/companion')).json();
  assert.equal(comp.fortuneToday, true);
  assert.ok(Array.isArray(comp.events));
  const diaryNone = await (await post('/api/diary/today')).json();
  assert.equal(diaryNone.entry, null, '今天還沒聊天，沒東西寫');
  await chat('今天去看展覽');
  env.setFm({ byKind: { diary: '[mood:joy] 她今天去看展覽。' } });
  const d = await (await post('/api/diary/today')).json();
  assert.equal(d.entry.text, '她今天去看展覽。');
  const list = await (await get('/api/diary')).json();
  assert.equal(list.entries.length, 1);
  assert.ok(list.firstMetAt);
});

test('把睡著的角色叫醒', async () => {
  await chat('晚安');
  assert.equal((await (await post('/api/companion/wake')).json()).ok, true);
  assert.equal((await (await get('/api/companion')).json()).asleep, false);
});

test('主動問候', async () => {
  env.setFm({ byKind: { greet: '[mood:joy] 哈囉！' } });
  const r = await (await post('/api/greet')).json();
  assert.equal(r.greeting, '哈囉！');
  assert.equal((await (await post('/api/greet')).json()).greeting, null, '同時段不再打');
});

test('天氣：沒設定地點 → null；查地點連不上 → 503 weather_unavailable', async () => {
  assert.deepEqual(await (await get('/api/weather')).json(), { weather: null, location: null });
  const res = await post('/api/weather/location', { query: '大阪' }, 'PUT');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'weather_unavailable');
  const cleared = await (await post('/api/weather/location', { query: '' }, 'PUT')).json();
  assert.equal(cleared.location, null);
});
