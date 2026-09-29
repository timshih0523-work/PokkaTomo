// 刪除角色、匯入備份、記憶搜尋（dataAdminService.js、routes/memory.js）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
env.writeChar('character.json', { id: '001', name: '毛毛', language: 'zh' });
env.writeChar('user.json', { nickname: '小美', preferences: ['草莓'] });
env.writeHistory([
  { role: 'user', content: '我昨天去看了一隻很可愛的貓', ts: new Date(2026, 7, 1, 10).getTime() },
  { role: 'assistant', content: '好好喔！是什麼顏色的猫？', ts: new Date(2026, 7, 1, 10, 1).getTime() },
  { role: 'user', content: '今天好熱', ts: new Date(2026, 7, 2, 10).getTime() }
]);
const { createApp } = await import('../server/app.js');
const { readZip, createZip } = await import('../server/lib/zip.js');
const { pickRestorableFiles } = await import('../server/dataAdminService.js');

let server;
let base;
let token;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await (await call('/api/lock/setup', { body: { pin: '2580' } })).json()).token;
});
after(() => {
  server.close();
  env.cleanup();
});

function call(p, { body, method, character, raw, headers = {} } = {}) {
  return fetch(base + p, {
    method: method || (body || raw ? 'POST' : 'GET'),
    headers: {
      ...(raw ? { 'Content-Type': 'application/zip' } : { 'Content-Type': 'application/json' }),
      ...(token ? { 'X-PokkaTomo-Token': token } : {}),
      ...(character ? { 'X-PokkaTomo-Character': character } : {}),
      ...headers
    },
    body: raw || (body ? JSON.stringify(body) : undefined)
  });
}
const json = async (...a) => (await call(...a)).json();

test('zip：自己產生的 zip 讀得回來（壓縮與不壓縮都行）', () => {
  const files = readZip(createZip([{ name: 'a/b.txt', data: 'x'.repeat(500) }, { name: '中文.json', data: '{}' }]));
  assert.deepEqual(files.map((f) => f.name), ['a/b.txt', '中文.json']);
  assert.equal(files[0].data.toString(), 'x'.repeat(500));
  assert.throws(() => readZip(Buffer.from('not a zip at all, definitely not')));
});

test('匯入只接受 data/ 底下合規則的路徑（../、密碼檔、其他檔案都忽略）', () => {
  const pick = pickRestorableFiles(
    ['p/data/app/characters.json', 'p/data/app/security.json', 'p/data/../evil.json', 'p/data/characters/001/conversations/2026-08.jsonl',
      'p/data/characters/001/diary.json', 'p/data/characters/001/evil.json', 'p/data/characters/../../x.json', 'p/對話紀錄.txt',
      'p/data/backups/daily/2026-08-01/a.json', 'p/data/x.json.corrupt-1', 'p/data/security.json'].map((name) => ({ name, data: Buffer.from('{}') }))
  );
  assert.deepEqual(pick.map((f) => f.rel), ['app/characters.json', 'characters/001/conversations/2026-08.jsonl', 'characters/001/diary.json', 'characters/001/evil.json']);
});

test('記憶搜尋：找封存裡提到關鍵字的話，繁體／日文漢字互通，新的在前面', async () => {
  const { conversations } = await json('/api/memory/search?q=' + encodeURIComponent('貓'));
  assert.equal(conversations.length, 2);
  assert.equal(conversations[0].role, 'assistant');
  assert.match(conversations[1].content, /可愛的貓/);
  assert.deepEqual((await json('/api/memory/search?q=')).conversations, []);
});

let second;
test('刪除角色：密碼錯不行；資料整個刪掉（連每日備份裡的也刪）', async () => {
  second = (await json('/api/characters', { body: { name: '小熊' } })).character;
  await call('/api/chat', { body: { message: '你好小熊' }, character: second.id });
  assert.ok(existsSync(path.join(env.dataDir, 'characters', second.id)));
  await new Promise((r) => setTimeout(r, 100)); // 等今天的自動備份寫完
  const daily = path.join(env.dataDir, 'backups', 'daily');
  const [day] = readdirSync(daily);
  assert.ok(existsSync(path.join(daily, day, 'characters', second.id)), '每日備份裡本來有');

  const wrong = await call(`/api/characters/${second.id}`, { method: 'DELETE', body: { pin: '1111' } });
  assert.equal(wrong.status, 401);

  const ok = await json(`/api/characters/${second.id}`, { method: 'DELETE', body: { pin: '2580' } });
  assert.equal(ok.ok, true);
  assert.equal((await json('/api/characters')).characters.length, 1);
  assert.ok(!existsSync(path.join(env.dataDir, 'characters', second.id)), '資料夾刪掉了');
  assert.ok(!existsSync(path.join(daily, day, 'characters', second.id)), '每日備份裡的也刪掉了');
  assert.ok(!existsSync(path.join(env.dataDir, 'backups', 'deleted-characters')), '不再另外留一份');
  assert.deepEqual(JSON.parse(readFileSync(path.join(env.dataDir, 'app', 'characters.json'), 'utf-8')).map((c) => c.id), ['001']);
});

test('匯入備份：先把現在的資料搬走再放進去；密碼維持這台的；不是備份檔會拒絕', async () => {
  const exported = Buffer.from(await (await call('/api/export')).arrayBuffer());
  // 匯出之後又改了一些東西
  await call('/api/profile', { body: { nickname: '改過的名字' } });
  const b = (await json('/api/characters', { body: { name: '第三隻' } })).character;
  assert.equal((await json('/api/characters')).characters.length, 2);

  const bad = await call('/api/import', { raw: createZip([{ name: 'x/hello.txt', data: 'hi' }]), headers: { 'X-PokkaTomo-Pin': '2580' } });
  assert.equal(bad.status, 400);
  const wrongPin = await call('/api/import', { raw: exported, headers: { 'X-PokkaTomo-Pin': '0000' } });
  assert.equal(wrongPin.status, 401);

  const r = await json('/api/import', { raw: exported, headers: { 'X-PokkaTomo-Pin': '2580' } });
  assert.equal(r.ok, true);
  assert.equal((await json('/api/profile')).nickname, '小美', '回到匯出那時候');
  assert.equal((await json('/api/characters')).characters.length, 1);
  assert.ok(!(await json('/api/characters')).characters.some((c) => c.id === b.id));
  // 對話還在，搜尋也找得到（快取有清掉）
  assert.equal((await json('/api/memory/search?q=' + encodeURIComponent('今天好熱'))).conversations.length, 1);
  // 匯入前的資料留著
  const before = readdirSync(path.join(env.dataDir, 'backups')).find((n) => n.startsWith('before-import-'));
  assert.ok(before);
  assert.equal(JSON.parse(readFileSync(path.join(env.dataDir, 'backups', before, 'characters', '001', 'user.json'), 'utf-8')).nickname, '改過的名字');
  // 密碼還是這台的
  assert.equal((await call('/api/lock/unlock', { body: { pin: '2580' } })).status, 200);
});

test('匯入舊版（2026-09 以前）匯出的 zip：自動轉成新結構', async () => {
  const old = createZip([
    { name: 'pokkatomo-2026-09-20/data/characters.json', data: JSON.stringify([{ id: 'default', name: '舊毛毛' }, { id: 'cxyz', name: '舊小熊' }]) },
    { name: 'pokkatomo-2026-09-20/data/security.json', data: JSON.stringify({ algo: 'scrypt', salt: 'x', pinHash: 'y' }) },
    { name: 'pokkatomo-2026-09-20/data/user_profile.json', data: JSON.stringify({ nickname: '舊的稱呼', language: 'zh' }) },
    { name: 'pokkatomo-2026-09-20/data/archive/2026-09.jsonl', data: `${JSON.stringify({ id: 'o1', ts: new Date(2026, 8, 20).getTime(), role: 'user', content: '舊的對話' })}\n` },
    { name: 'pokkatomo-2026-09-20/data/characters/cxyz/user_profile.json', data: JSON.stringify({ nickname: 'ご主人さま', language: 'ja' }) }
  ]);
  const r = await json('/api/import', { raw: old, headers: { 'X-PokkaTomo-Pin': '2580' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.characters, 2);
  const { characters } = await json('/api/characters');
  assert.deepEqual(characters.map((c) => [c.id, c.name]), [['001', '舊毛毛'], ['002', '舊小熊']]);
  assert.equal((await json('/api/profile', { character: '002' })).language, 'ja');
  assert.equal((await json('/api/history/day?date=2026-09-20')).messages[0].content, '舊的對話');
  assert.ok(existsSync(path.join(env.dataDir, 'characters', '001', 'conversations', '2026-09.jsonl')));
  // 密碼沒有被舊 zip 蓋掉
  assert.equal((await call('/api/lock/unlock', { body: { pin: '2580' } })).status, 200);
});

test('最後一個角色也可以刪：回到「還沒有角色」，不會自動建立；新增的角色從預設值開始', async () => {
  for (const c of (await json('/api/characters')).characters) {
    assert.equal((await json(`/api/characters/${c.id}`, { method: 'DELETE', body: { pin: '2580' } })).ok, true);
  }
  assert.deepEqual((await json('/api/characters')).characters, [], '沒有自動建立角色');
  assert.deepEqual(readdirSync(path.join(env.dataDir, 'characters')), []);
  // 需要「目前角色」的 API：409 no_character
  for (const p of ['/api/profile', '/api/history', '/api/companion']) {
    const r = await call(p);
    assert.equal(r.status, 409, p);
    assert.equal((await r.json()).error, 'no_character');
  }
  // 不需要角色的照常可以用
  assert.equal((await call('/api/lan')).status, 200);
  assert.equal((await call('/api/export')).status, 200);
  assert.deepEqual((await json('/api/characters')).characters, [], '上面那些請求也沒有順便建立角色');

  const ja = (await json('/api/characters', { body: { name: 'ミミ', language: 'ja' } })).character;
  const p = await json('/api/profile', { character: ja.id });
  assert.equal(p.nickname, 'ご主人さま');
  assert.equal(p.language, 'ja');
  assert.deepEqual(p.preferences, []);
  assert.equal(p.location, null);
});
