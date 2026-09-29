import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, PALETTE_COLORS, paletteStyle } from '../../web/src/palettes.js';
import { PALETTES as SERVER_PALETTES, AVATAR_STYLES } from '../../server/characterService.js';

test('毛色：前端跟後端的清單一樣，每個都有四個顏色', () => {
  assert.deepEqual([...PALETTES].sort(), [...SERVER_PALETTES].sort());
  for (const p of PALETTES) {
    for (const k of ['top', 'bottom', 'mid', 'line']) assert.match(PALETTE_COLORS[p][k], /^#[0-9a-f]{6}$/i, `${p}.${k}`);
  }
  assert.deepEqual(AVATAR_STYLES, ['full', 'classic']);
});

test('paletteStyle：不認得的名字用預設（peach）', () => {
  assert.equal(paletteStyle('nope')['--pal-top'], PALETTE_COLORS.peach.top);
  assert.equal(paletteStyle('mint')['--pal-line'], PALETTE_COLORS.mint.line);
});
