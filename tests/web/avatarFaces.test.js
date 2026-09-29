import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eyeStyleFor, mouthFor, showsMoodFace, QUIRK_MOUTHS, MOOD_MOUTHS } from '../../web/src/avatarFaces.js';
import { useAvatarHit } from '../../web/src/composables/useAvatarHit.js';

test('眼睛：頭暈 > 閉眼（睡著／呵欠／噴嚏）> 睜開', () => {
  assert.equal(eyeStyleFor('IDLE', 'dizzy'), 'dizzy');
  assert.equal(eyeStyleFor('ASLEEP', null), 'closed');
  assert.equal(eyeStyleFor('IDLE', 'yawn'), 'closed');
  assert.equal(eyeStyleFor('SPEAKING', null), 'open');
});

test('嘴型：小動作 > 睡著 > 情緒（只在平常／開心時）> 狀態', () => {
  assert.equal(mouthFor('ASLEEP', 'sad', 'wave'), QUIRK_MOUTHS.wave);
  assert.equal(mouthFor('IDLE', 'sad', null), MOOD_MOUTHS.sad);
  assert.notEqual(mouthFor('LISTENING', 'sad', null), MOOD_MOUTHS.sad, '在聽的時候不套情緒臉');
  assert.notEqual(mouthFor('SPEAKING', 'sad', null), MOOD_MOUTHS.sad, '講話的嘴型由動畫處理');
  assert.ok(mouthFor('WHATEVER', 'calm', 'unknown-quirk').startsWith('M'));
  assert.equal(showsMoodFace('THINKING'), false);
});

test('App.vue 用到的部位小動作都有嘴型', async () => {
  const src = (await import('fs')).readFileSync(new URL('../../web/src/App.vue', import.meta.url), 'utf-8');
  const map = /const PART_QUIRK = (\{[^}]+\})/.exec(src)[1];
  for (const q of map.match(/'(\w+)'/g).map((x) => x.slice(1, -1)).filter((x) => !['cheek', 'ear', 'belly', 'hand', 'foot', 'tail'].includes(x))) {
    assert.ok(QUIRK_MOUTHS[q], q);
  }
});

test('useAvatarHit：只有感應區算數、同一部位不重複 hover、離開再回來會再觸發', () => {
  const events = [];
  const hit = useAvatarHit((type, p) => events.push([type, p.part, p.side]));
  const el = (part, side) => ({ closest: () => ({ getAttribute: (k) => (k === 'data-part' ? part : side) }) });
  const empty = { closest: () => null };
  hit.onClick({ target: el('hand', 'left') });
  hit.onClick({ target: empty });
  hit.onPointerOver({ target: el('tail', null) });
  hit.onPointerOver({ target: el('tail', null) });
  hit.onPointerOut({ relatedTarget: empty });
  hit.onPointerOver({ target: el('tail', null) });
  hit.emitTouch('head');
  assert.deepEqual(events, [
    ['touch', 'hand', 'left'],
    ['hover', 'tail', null],
    ['hover', 'tail', null],
    ['touch', 'head', null]
  ]);
});
