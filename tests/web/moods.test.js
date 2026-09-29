import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOODS as FRONT_MOODS, moodColor, DEFAULT_MOOD } from '../../web/src/moods.js';
import { MOODS as BACK_MOODS } from '../../server/lib/mood.js';

test('前端跟後端的情緒清單一致（後端多一種，前端就沒有燈的顏色）', () => {
  assert.deepEqual([...FRONT_MOODS].sort(), [...BACK_MOODS].sort());
});

test('每種情緒都有顏色；不認得的用預設顏色', () => {
  for (const m of FRONT_MOODS) assert.match(moodColor(m), /^#[0-9a-f]{6}$/i);
  assert.equal(moodColor('???'), moodColor(DEFAULT_MOOD));
});
