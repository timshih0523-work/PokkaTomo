import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selfPromptLine } from '../../server/lib/selfKnowledge.js';

test('全身角色：知道自己胸口的愛心是心情燈、每個顏色的意思、毛色、有尾巴', () => {
  const s = selfPromptLine({ avatarStyle: 'full', palette: 'mint' });
  assert.match(s, /胸口.*愛心.*心情燈/);
  for (const w of ['黃色是開心', '粉紅色是喜歡', '薄荷綠是平靜', '藍色是難過', '紫色是擔心', '水藍色是驚訝']) assert.ok(s.includes(w), w);
  assert.match(s, /毛是薄荷綠/);
  assert.match(s, /尾巴/);
});

test('舊版圓圓角色：心情燈在肚子、沒有手腳尾巴；沒給外觀用預設', () => {
  const s = selfPromptLine({ avatarStyle: 'classic', palette: 'cocoa' });
  assert.match(s, /肚子.*心情燈/);
  assert.ok(!s.includes('尾巴'));
  assert.match(selfPromptLine(), /毛是蜜桃色/);
});

import { identityRulesLine } from '../../server/lib/selfKnowledge.js';
test('身份規則：不能說自己是 AI、不要重複、不要每句打招呼', () => {
  const s = identityRulesLine('毛毛');
  assert.match(s, /「毛毛」本人/);
  assert.match(s, /絕對不可以說自己是 AI/);
  assert.match(s, /不要重複/);
  assert.match(s, /招呼/);
});

import { styleGuideLine } from '../../server/lib/selfKnowledge.js';
test('說話風格：中文口語＋示範；日文要求用日文、不用敬語', () => {
  assert.match(styleGuideLine('zh'), /口語/);
  assert.match(styleGuideLine('zh'), /示範/);
  assert.match(styleGuideLine('ja'), /日本語/);
  assert.match(styleGuideLine('ja'), /敬語/);
});
