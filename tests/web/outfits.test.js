import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonalOutfit, resolveOutfit, sanitizeOutfit, WARDROBE_ITEMS, WARDROBE_SLOTS, holidayHeadFor } from '../../web/src/outfits.js';
import * as serverWardrobe from '../../server/lib/wardrobe.js';
import { reactionQuirkFor } from '../../web/src/composables/useQuirks.js';
import { pinErrorMessage } from '../../web/src/pinErrors.js';
import { STRINGS } from '../../web/src/i18n.js';

test('換季服裝：春小花、夏草帽、秋貝雷帽、冬圍巾', () => {
  const at = (m) => seasonalOutfit(new Date(2026, m - 1, 15));
  assert.deepEqual([3, 5, 6, 8, 9, 11, 12, 1, 2].map(at), ['flowers', 'flowers', 'strawhat', 'strawhat', 'beret', 'beret', 'scarf', 'scarf', 'scarf']);
});

test('衣櫥：前端跟後端的清單一樣；兩種語言都有每件衣服的名字', () => {
  assert.deepEqual(WARDROBE_SLOTS, serverWardrobe.WARDROBE_SLOTS);
  assert.deepEqual(WARDROBE_ITEMS, serverWardrobe.WARDROBE_ITEMS);
  for (const lang of ['zh', 'ja']) {
    const w = STRINGS[lang].wardrobe;
    for (const slot of WARDROBE_SLOTS) {
      assert.ok(w.slots[slot], `${lang} slot ${slot}`);
      for (const id of WARDROBE_ITEMS[slot]) assert.ok(w.items[id], `${lang} ${id}`);
    }
    assert.ok(STRINGS[lang].wardrobeReactions.length >= 3);
  }
});

test('衣櫥：自動＝節日配件／換季；自己選的一直穿（節日也不換）；不戴＝null', () => {
  const summer = new Date(2026, 6, 1);
  const winter = new Date(2026, 11, 25);
  assert.deepEqual(resolveOutfit(undefined, { date: summer }), { head: 'strawhat', neck: null, body: null, face: null });
  assert.deepEqual(resolveOutfit({}, { date: winter, events: ['christmas'] }), { head: 'santa', neck: 'scarf', body: null, face: null });
  assert.deepEqual(
    resolveOutfit({ head: 'crown', neck: 'none', body: 'yukata', face: 'sunglasses' }, { date: winter, events: ['christmas'] }),
    { head: 'crown', neck: null, body: 'yukata', face: 'sunglasses' }
  );
  // 前端跟後端的規則一樣（後端不知道節日）
  for (const date of [summer, winter, new Date(2026, 3, 1), new Date(2026, 9, 1)]) {
    const o = { head: 'auto', neck: 'auto', body: 'sweater', face: 'none' };
    assert.deepEqual(resolveOutfit(o, { date }), serverWardrobe.resolveOutfit(o, { date }));
  }
  assert.equal(holidayHeadFor(['halloween']), 'witch');
  // 不認得的值、放錯部位的衣服 → 自動
  assert.deepEqual(sanitizeOutfit({ head: 'scarf', neck: 'evil', body: 'apron' }), { head: 'auto', neck: 'auto', body: 'apron', face: 'auto' });
  assert.deepEqual(serverWardrobe.sanitizeOutfit({ head: 'scarf', neck: 'evil', body: 'apron', extra: 1 }), { head: 'auto', neck: 'auto', body: 'apron', face: 'auto' });
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
