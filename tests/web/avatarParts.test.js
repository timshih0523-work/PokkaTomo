import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, CURRENT_AVATAR_PARTS, normalizePart } from '../../web/src/avatarParts.js';
import { TOUCH_PARTS } from '../../server/companionService.js';
import { STRINGS, LANGUAGES } from '../../web/src/i18n.js';

test('部位名稱：前端跟後端的清單一致', () => {
  assert.deepEqual([...PARTS].sort(), [...TOUCH_PARTS].sort());
});

test('現在這隻角色的每個部位（除了 body 用一般反應）每個語言都有專屬台詞', () => {
  for (const lang of LANGUAGES) {
    for (const part of CURRENT_AVATAR_PARTS.filter((p) => p !== 'body')) {
      assert.ok(STRINGS[lang].partReactions[part]?.length > 0, `${lang}.${part}`);
    }
  }
});

test('normalizePart：標準名稱、同義詞、左右、3D 骨架常見的寫法', () => {
  assert.deepEqual(normalizePart('head'), { part: 'head', side: null });
  assert.deepEqual(normalizePart('ear', 'left'), { part: 'ear', side: 'left' });
  assert.deepEqual(normalizePart('LeftHand'), { part: 'hand', side: 'left' });
  assert.deepEqual(normalizePart('right_foot'), { part: 'foot', side: 'right' });
  assert.deepEqual(normalizePart('Ear.L'), { part: 'ear', side: 'left' });
  assert.deepEqual(normalizePart('ear-r'), { part: 'ear', side: 'right' });
  assert.deepEqual(normalizePart('hair'), { part: 'head', side: null });
  assert.deepEqual(normalizePart('tummy'), { part: 'belly', side: null });
});

test('normalizePart：不認得的部位、空值 → body；奇怪的 side 被忽略', () => {
  assert.deepEqual(normalizePart('antenna'), { part: 'body', side: null });
  assert.deepEqual(normalizePart(undefined), { part: 'body', side: null });
  assert.deepEqual(normalizePart('head', 'up'), { part: 'head', side: null });
});

import { readFileSync } from 'fs';
import { CLASSIC_AVATAR_PARTS, FULL_BODY_PARTS } from '../../web/src/avatarParts.js';

const dataParts = (file) =>
  [...new Set([...readFileSync(new URL(`../../web/src/components/${file}`, import.meta.url), 'utf-8').matchAll(/data-part="(\w+)"/g)].map((m) => m[1]))].sort();

test('兩隻角色標出來的感應區部位，跟清單一致、都在詞彙裡', () => {
  assert.deepEqual(dataParts('SvgAvatar.vue'), [...CLASSIC_AVATAR_PARTS].sort());
  assert.deepEqual(dataParts('FullBodyAvatar.vue'), [...FULL_BODY_PARTS].sort());
  for (const p of FULL_BODY_PARTS) assert.ok(PARTS.includes(p), p);
});

test('全身角色的每個部位（除了 body）每個語言都有專屬台詞', () => {
  for (const lang of LANGUAGES) {
    for (const part of FULL_BODY_PARTS.filter((p) => p !== 'body')) {
      assert.ok(STRINGS[lang].partReactions[part]?.length > 0, `${lang}.${part}`);
    }
  }
});
