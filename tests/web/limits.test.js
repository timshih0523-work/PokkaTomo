import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limits, loadLimits, clampText } from '../../web/src/limits.js';
import { LIMITS } from '../../server/config.js';

test('前端的欄位清單跟後端 LIMITS 一樣（前端不寫數字，只寫欄位名稱）', () => {
  assert.deepEqual(Object.keys(limits).sort(), Object.keys(LIMITS).sort());
  assert.ok(Object.values(limits).every((v) => v === null), '還沒載入前是 null');
});

test('loadLimits：從 /api/config 拿數字；失敗時維持原狀', async () => {
  assert.equal(await loadLimits(async () => ({ ok: false })), false);
  assert.equal(await loadLimits(async () => { throw new Error('offline'); }), false);
  assert.equal(limits.message, null);
  const ok = await loadLimits(async (url) => {
    assert.equal(url, '/api/config');
    return { ok: true, json: async () => ({ limits: { ...LIMITS, bogus: 1, nickname: 'x' } }) };
  });
  assert.equal(ok, true);
  assert.equal(limits.message, LIMITS.message);
  assert.equal(limits.nickname, null, '不是數字的忽略');
  assert.ok(!('bogus' in limits));
});

test('clampText', () => {
  assert.equal(clampText('abcdef', 3), 'abc');
  assert.equal(clampText('abcdef', null), 'abcdef');
  assert.equal(clampText(undefined, 3), '');
});
