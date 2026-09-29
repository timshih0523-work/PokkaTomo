import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonalOutfit, SEASONAL_OUTFITS } from '../../web/src/outfits.js';
import { reactionQuirkFor } from '../../web/src/composables/useQuirks.js';
import { pinErrorMessage } from '../../web/src/pinErrors.js';
import { STRINGS } from '../../web/src/i18n.js';

test('換季服裝：春小花、夏草帽、秋貝雷帽、冬圍巾', () => {
  const at = (m) => seasonalOutfit(new Date(2026, m - 1, 15));
  assert.deepEqual([3, 5, 6, 8, 9, 11, 12, 1, 2].map(at), ['flowers', 'flowers', 'strawhat', 'strawhat', 'beret', 'beret', 'scarf', 'scarf', 'scarf']);
  assert.deepEqual(SEASONAL_OUTFITS, ['flowers', 'strawhat', 'beret', 'scarf']);
});

test('聊到吃的 → 吃點心；聊到音樂跳舞 → 跳舞；其他沒有', () => {
  assert.equal(reactionQuirkFor('我肚子好餓'), 'eat');
  assert.equal(reactionQuirkFor('お腹すいた〜ごはん食べたい'), 'eat');
  assert.equal(reactionQuirkFor('一起跳舞吧'), 'dance');
  assert.equal(reactionQuirkFor('カラオケ行きたい'), 'dance');
  assert.equal(reactionQuirkFor('今天天氣很好'), null);
});

test('再確認密碼的錯誤訊息（兩種語言）', () => {
  for (const lang of ['zh', 'ja']) {
    const lock = STRINGS[lang].lock;
    assert.equal(pinErrorMessage({ error: 'wrong_pin', attemptsLeft: 3 }, lock), lock.wrong(3));
    assert.equal(pinErrorMessage({ error: 'too_many_attempts', retryAfterSec: 60 }, lock), lock.tooMany(60));
  }
});

test('介面文字不出現「AI」（角色不說自己是 AI，畫面也不要提醒）', () => {
  const walk = (v, path) => {
    if (typeof v === 'string') assert.ok(!/\bAI\b|AI/.test(v), `${path} 有 AI：${v}`);
    else if (typeof v === 'function') {
      const out = v(1, 'x');
      if (typeof out === 'string') assert.ok(!/AI/.test(out), `${path}()`);
    } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(STRINGS.zh, 'zh');
  walk(STRINGS.ja, 'ja');
});
