// 資料保存相關的 API：永久封存、RAG 進 prompt、匯出 zip、設定、前端錯誤回報、自動備份。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { setupTestEnv } from './helpers/env.js';
import { readZip } from './helpers/readZip.js';

const env = setupTestEnv();
const { createApp } = await import('../server/app.js');
const { LIMITS } = await import('../server/config.js');
const { logFilePath } = await import('../server/lib/logger.js');

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

const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const chat = async (message) => (await post('/api/chat', { message })).json();
const lastChatPrompt = () => env.fmCalls().filter((c) => c.kind === 'chat').at(-1).instructions;

test('GET /api/config：字數上限只有一份', async () => {
  const r = await (await fetch(`${base}/api/config`)).json();
  assert.deepEqual(r.limits, { ...LIMITS });
});

test('每則對話都進永久封存；舊事會被 RAG 想起、放進 prompt', async () => {
  env.setFm({ reply: '[mood:joy] 好好吃！' });
  await chat('我最喜歡吃豚骨拉麵了');
  // 聊別的，把拉麵擠出最近 8 則的上下文
  for (let i = 0; i < 5; i++) await chat(`第${i}件事是關於工作跟天氣`);
  await chat('今晚想吃拉麵');
  assert.match(lastChatPrompt(), /你想起以前跟使用者聊過/);
  assert.match(lastChatPrompt(), /豚骨拉麵/);
  const files = readdirSync(env.charFile('conversations'));
  assert.equal(files.length, 1);
  const lines = readFileSync(path.join(env.charFile('conversations'), files[0]), 'utf-8').trim().split('\n');
  assert.equal(lines.length, 14);
});

test('還在最近上下文裡的事不會被重複「想起來」；短訊息、儀式不搜尋', async () => {
  await chat('我養了一隻叫小花的貓');
  await chat('小花今天好可愛');
  assert.doesNotMatch(lastChatPrompt(), /你想起以前/);
  await chat('晚安');
  assert.doesNotMatch(lastChatPrompt(), /你想起以前/);
});

test('聊天後會做今天的自動備份', async () => {
  await new Promise((r) => setTimeout(r, 100));
  const dir = path.join(env.dataDir, 'backups', 'daily');
  assert.ok(existsSync(dir));
  const [day] = readdirSync(dir);
  assert.ok(existsSync(path.join(dir, day, 'characters', '001', 'conversations')));
});

test('GET /api/export：zip 裡有對話紀錄、日記、原始資料、紀錄檔', async () => {
  await post('/api/profile', { nickname: '小美', companionName: '毛毛' });
  const res = await fetch(`${base}/api/export`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  assert.match(res.headers.get('content-disposition'), /attachment; filename="pokkatomo-\d{4}-\d{2}-\d{2}\.zip"/);
  const files = readZip(Buffer.from(await res.arrayBuffer()));
  const names = Object.keys(files);
  const root = names[0].split('/')[0];
  for (const n of ['README.txt', '毛毛/對話紀錄.txt', '毛毛/日記.txt', 'data/app/characters.json', 'data/characters/001/character.json', 'data/characters/001/user.json']) {
    assert.ok(names.includes(`${root}/${n}`), n);
  }
  assert.ok(names.some((n) => n.startsWith(`${root}/data/characters/001/conversations/`) && n.endsWith('.jsonl')));
  assert.ok(names.some((n) => n.startsWith(`${root}/logs/`)));
  const transcript = files[`${root}/毛毛/對話紀錄.txt`];
  assert.match(transcript, /^==== \d{4}-\d{2}-\d{2} ====/);
  assert.match(transcript, /\] 小美：我最喜歡吃豚骨拉麵了/);
  assert.match(transcript, /\] 毛毛：好好吃！/);
  assert.ok(!names.some((n) => n.includes('backups')), '備份資料夾不用放進匯出');
});

test('POST /api/log：前端錯誤寫進紀錄檔；缺 event 是 400；太多會被節流', async () => {
  assert.equal((await post('/api/log', { event: 'speech', detail: 'not-allowed', level: 'warn' })).status, 200);
  assert.equal((await post('/api/log', {})).status, 400);
  for (let i = 0; i < 40; i++) await post('/api/log', { event: 'spam' });
  const lines = readFileSync(logFilePath(), 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  const speech = lines.find((l) => l.event === 'client_speech');
  assert.equal(speech.level, 'warn');
  assert.equal(speech.detail, 'not-allowed');
  assert.ok(lines.filter((l) => l.event === 'client_spam').length < 40);
  // 模型呼叫有記錄耗時，而且不記內容
  const fm = lines.find((l) => l.event === 'fm_ok');
  assert.equal(fm.purpose, 'chat');
  assert.ok(Number.isFinite(fm.ms));
  assert.ok(!JSON.stringify(lines).includes('豚骨'), '紀錄檔不含對話內容');
});

test('GET /api/history/day：今天的全部對話（從永久封存，不受 600 則限制）；日期格式錯是 400', async () => {
  const r = await (await fetch(`${base}/api/history/day`)).json();
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(r.messages.length >= 14);
  assert.equal(r.messages[0].content, '我最喜歡吃豚骨拉麵了');
  assert.ok(r.messages.every((m, i, a) => i === 0 || a[i - 1].ts <= m.ts), '舊到新');
  assert.ok(!('id' in r.messages[0]), '只回畫面需要的欄位');
  assert.deepEqual((await (await fetch(`${base}/api/history/day?date=2000-01-01`)).json()).messages, []);
  assert.equal((await fetch(`${base}/api/history/day?date=yesterday`)).status, 400);
});

test('占卜卡片存進封存時保留卡片內容（今天的對話可以重畫卡片）', async () => {
  env.setFm({ byKind: { fortune: '[mood:joy] 今天運氣很好喔' } });
  await post('/api/fortune', {});
  const r = await (await fetch(`${base}/api/history/day`)).json();
  const card = r.messages.find((m) => m.kind === 'fortune');
  assert.ok(card.fortune?.rankText);
});

test('聊天 prompt：占卜只在問到運勢時才出現；角色知道自己的心情燈', async () => {
  await post('/api/fortune', {});
  env.setFm({ reply: '[mood:calm] 嗯嗯' });
  await chat('今天好熱喔，想吃冰');
  assert.doesNotMatch(lastChatPrompt(), /占卜過了/);
  assert.doesNotMatch(lastChatPrompt(), /【今日占卜】/);
  assert.match(lastChatPrompt(), /心情燈/);
  const lastMsg = env.fmCalls().filter((c) => c.kind === 'chat').at(-1).message;
  assert.ok(!lastMsg.includes('【今日占卜】'), '占卜卡片不在對話上下文裡');
  await chat('那我今天的運勢怎麼樣？');
  assert.match(lastChatPrompt(), /占卜過了/);
});
