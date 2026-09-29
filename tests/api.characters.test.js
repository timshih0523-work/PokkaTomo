// 多角色：每個角色一個資料夾 characters/<編號>/，名字、個性、外觀、對話、日記、親密度、設定都各自獨立。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
// 已經有第一個角色（001）：名字、個性、認識那天在 character.json；稱呼、喜好在 user.json
env.writeChar('character.json', { id: '001', name: '毛毛', language: 'zh', personaPrompt: '你是傲嬌的貓', firstMetAt: '2026-08-01', createdAt: null });
env.writeChar('user.json', { nickname: '小美', preferences: ['草莓'] });
env.writeHistory([{ role: 'user', content: '舊的話', ts: new Date(2026, 7, 1).getTime() }]);
const { createApp } = await import('../server/app.js');
const { DEFAULT_PERSONA, DEFAULT_PERSONA_JA } = await import('../server/characterService.js');

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

const req = (p, { body, method, character } = {}) =>
  fetch(base + p, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(character ? { 'X-PokkaTomo-Character': character } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then((r) => r.json());

let second;

test('第一個角色 001：名字、個性、認識那天從 character.json 讀', async () => {
  const { characters } = await req('/api/characters');
  assert.equal(characters.length, 1);
  assert.equal(characters[0].id, '001');
  assert.equal(characters[0].name, '毛毛');
  assert.equal(characters[0].firstMetAt, '2026-08-01');
  const p = await req('/api/profile');
  assert.equal(p.companionName, '毛毛');
  assert.equal(p.personaPrompt, '你是傲嬌的貓');
  assert.equal(p.characterId, '001');
});

test('新增角色：預設外觀、沒有認識日；名字／毛色可以指定', async () => {
  const { character } = await req('/api/characters', { body: { name: '小熊', palette: 'cocoa', avatarStyle: 'classic', evil: 1 } });
  second = character;
  assert.equal(second.id, '002', '編號照順序');
  assert.equal(second.name, '小熊');
  assert.equal(second.palette, 'cocoa');
  assert.equal(second.avatarStyle, 'classic');
  assert.equal(second.firstMetAt, null);
  assert.equal((await req('/api/characters')).characters.length, 2);
});

test('所有設定都跟著角色走：名字、個性、介面語言、稱呼、喜好、紀念日、城市各自獨立', async () => {
  await req('/api/profile', {
    body: { personaPrompt: '你是溫柔的熊', nickname: '美美', uiLanguage: 'ja', preferences: ['蜂蜜'], anniversaries: [{ name: '生日', date: '2000-01-02' }] },
    character: second.id
  });
  const p2 = await req('/api/profile', { character: second.id });
  const p1 = await req('/api/profile');
  assert.equal(p2.personaPrompt, '你是溫柔的熊');
  assert.equal(p2.uiLanguage, 'ja');
  assert.equal(p2.language, 'zh', '介面語言跟說話的語言分開');
  assert.equal(p2.nickname, '美美');
  assert.deepEqual(p2.preferences, ['蜂蜜']);
  assert.equal(p1.personaPrompt, '你是傲嬌的貓', '第一個角色不受影響');
  assert.equal(p1.language, 'zh');
  assert.equal(p1.uiLanguage, 'zh', '沒設定介面語言 → 跟說話的語言一樣');
  assert.equal(p1.nickname, '小美');
  assert.deepEqual(p1.preferences, ['草莓']);
  assert.deepEqual(p1.anniversaries, []);
  assert.ok(existsSync(path.join(env.dataDir, 'characters', second.id, 'user.json')));
});

test('新增角色 → 只有預設值（稱呼主人、預設個性），不複製其他角色的任何設定', async () => {
  const { character } = await req('/api/characters', { body: { name: '第三隻', language: 'ja' } });
  const p = await req('/api/profile', { character: character.id });
  assert.equal(p.language, 'ja');
  assert.equal(p.nickname, 'ご主人さま');
  assert.deepEqual(p.preferences, []);
  assert.deepEqual(p.anniversaries, []);
  assert.equal(p.location, null);
  assert.equal(p.personaPrompt, DEFAULT_PERSONA_JA, '選日文 → 預設個性也是日文');
  assert.equal(p.firstMetAt, null);

  // 沒選語言 → 中文、稱呼「主人」；別的角色設定的喜好／紀念日／城市都不會帶過來
  await req('/api/profile', { body: { location: { query: '台北', name: '台北', latitude: 25.03, longitude: 121.56 } } });
  const { character: fourth } = await req('/api/characters', { body: { name: '第四隻' } });
  const q = await req('/api/profile', { character: fourth.id });
  assert.equal(q.language, 'zh');
  assert.equal(q.nickname, '主人');
  assert.deepEqual(q.preferences, []);
  assert.deepEqual(q.anniversaries, []);
  assert.equal(q.location, null);
  assert.equal(q.personaPrompt, DEFAULT_PERSONA);

  // 說話的語言建立後就不能改：POST /api/profile 帶 language 會被忽略；介面語言（uiLanguage）可以改
  await req('/api/profile', { body: { language: 'ja', uiLanguage: 'ja' }, character: fourth.id });
  const q2 = await req('/api/profile', { character: fourth.id });
  assert.equal(q2.language, 'zh');
  assert.equal(q2.uiLanguage, 'ja');
  assert.equal(q2.nickname, '主人');
  assert.equal(q2.personaPrompt, DEFAULT_PERSONA);
});

test('對話、封存、親密度、認識那天各自獨立；資料放在 characters/<id>/', async () => {
  await req('/api/chat', { body: { message: '你好小熊，今天好熱' }, character: second.id });
  const h2 = await req('/api/history?limit=50', { character: second.id });
  const h1 = await req('/api/history?limit=50');
  assert.deepEqual(h2.map((m) => m.role), ['user', 'assistant']);
  assert.equal(h1.length, 1, '第一個角色只有原本的舊話');
  const dir = path.join(env.dataDir, 'characters', second.id);
  assert.ok(existsSync(path.join(dir, 'character.json')));
  assert.ok(existsSync(path.join(dir, 'state.json')));
  assert.ok(existsSync(path.join(dir, 'conversations')));
  assert.ok(!existsSync(path.join(dir, 'chat_history.json')), '對話只存一份');
  const today = await req('/api/history/day', { character: second.id });
  assert.equal(today.messages.length, 2);
  const chars = (await req('/api/characters')).characters;
  assert.ok(chars.find((c) => c.id === second.id).firstMetAt, '第一次聊天記下認識那天');
  assert.equal(chars.find((c) => c.id === '001').firstMetAt, '2026-08-01');
  // prompt 用的是第二個角色的名字與個性
  const call = env.fmCalls().find((c) => c.kind === 'chat');
  assert.match(call.instructions, /你是溫柔的熊/);
  assert.match(call.instructions, /「小熊」/);
});

test('不存在／亂寫的角色 id → 當成第一個角色', async () => {
  assert.equal((await req('/api/profile', { character: 'nope' })).characterId, '001');
  assert.equal((await req('/api/profile', { character: '../../etc' })).characterId, '001');
});

test('角色清單 app/characters.json：只有編號＋名字（給人看的索引）；角色本身在 character.json，時間人看得懂', () => {
  const list = JSON.parse(readFileSync(path.join(env.dataDir, 'app', 'characters.json'), 'utf-8'));
  assert.deepEqual(list.slice(0, 2), [{ id: '001', name: '毛毛' }, { id: '002', name: '小熊' }]);
  const c = env.readChar('character.json', '002');
  assert.deepEqual(Object.keys(c), ['id', 'name', 'language', 'personaPrompt', 'avatarStyle', 'palette', 'outfit', 'voice', 'voicePitch', 'voiceRate', 'firstMetAt', 'createdAt']);
  assert.match(c.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});

test('聲音設定存在角色上：一個聲音（說話語言固定）、音高語速有範圍', async () => {
  const p = await req('/api/profile', { body: { voice: 'Meijia (Enhanced)', voicePitch: 9, voiceRate: 0.1 }, character: second.id });
  assert.equal(p.voice, 'Meijia (Enhanced)');
  assert.equal(p.voicePitch, 1.6);
  assert.equal(p.voiceRate, 0.7);
  const p1 = await req('/api/profile');
  assert.equal(p1.voice, '', '第一個角色不受影響');
  assert.equal(p1.voicePitch, 1.05);
});

test('調整角色順序：照給的順序存進 app/characters.json；不認得的忽略、漏掉的接在後面', async () => {
  const before = (await req('/api/characters')).characters.map((c) => c.id);
  const reversed = [...before].reverse();
  const r = await req('/api/characters/order', { method: 'PUT', body: { ids: ['nope', ...reversed.slice(0, -1)] } });
  assert.deepEqual(r.characters.map((c) => c.id), [...reversed.slice(0, -1), reversed.at(-1)]);
  assert.deepEqual(JSON.parse(readFileSync(path.join(env.dataDir, 'app', 'characters.json'), 'utf-8')).map((c) => c.id), reversed);
  assert.deepEqual((await req('/api/characters')).characters.map((c) => c.id), reversed);
  // 沒指定角色時用清單第一個
  assert.equal((await req('/api/profile')).characterId, reversed[0]);
  await req('/api/characters/order', { method: 'PUT', body: { ids: before } });
});
