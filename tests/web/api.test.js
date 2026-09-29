import { test } from 'node:test';
import assert from 'node:assert/strict';
import { session, apiHeaders, installApiFetch, onLocked } from '../../web/src/api.js';

test('apiHeaders：有 token／角色才加，不蓋掉呼叫端自己給的', () => {
  session.token = null;
  session.characterId = null;
  assert.equal(apiHeaders().has('X-PokkaTomo-Token'), false);
  session.token = 'abc';
  session.characterId = 'c1';
  const h = apiHeaders({ 'Content-Type': 'application/json' });
  assert.equal(h.get('X-PokkaTomo-Token'), 'abc');
  assert.equal(h.get('X-PokkaTomo-Character'), 'c1');
  assert.equal(h.get('Content-Type'), 'application/json');
  assert.equal(apiHeaders({ 'X-PokkaTomo-Token': 'mine' }).get('X-PokkaTomo-Token'), 'mine');
});

test('installApiFetch：/api 請求帶標頭；401 locked 會清掉 token 並通知；別的網址不動', async () => {
  const calls = [];
  const fakeWin = {
    location: { href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    fetch: async (input, init = {}) => {
      calls.push({ input, headers: init.headers });
      const locked = String(input).includes('secret');
      return new Response(JSON.stringify(locked ? { error: 'locked' } : { ok: true }), { status: locked ? 401 : 200 });
    }
  };
  globalThis.window = fakeWin;
  installApiFetch(fakeWin);
  session.token = 't1';
  session.characterId = 'default';
  let lockedCount = 0;
  const off = onLocked(() => lockedCount++);

  await fakeWin.fetch('/api/profile');
  assert.equal(calls[0].headers.get('X-PokkaTomo-Token'), 't1');
  await fakeWin.fetch('https://example.com/x');
  assert.equal(calls[1].headers, undefined, '外部網址不加標頭');
  await fakeWin.fetch('/api/secret');
  assert.equal(lockedCount, 1);
  assert.equal(session.token, null);
  off();
  delete globalThis.window;
});
