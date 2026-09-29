import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateKey, timeSlot } from '../../server/lib/time.js';

test('localDateKey 用本地日期、補零', () => {
  assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('一天四個時段', () => {
  const at = (h) => timeSlot(new Date(2026, 8, 28, h, 0)).slot;
  assert.equal(at(5), 'morning');
  assert.equal(at(10), 'morning');
  assert.equal(at(11), 'afternoon');
  assert.equal(at(17), 'evening');
  assert.equal(at(23), 'night');
  assert.equal(at(3), 'night');
});

test('凌晨算前一天的深夜（過了午夜不會又打一次「深夜」招呼）', () => {
  assert.deepEqual(timeSlot(new Date(2026, 8, 29, 2, 0)), { slot: 'night', dayKey: '2026-09-28' });
  assert.deepEqual(timeSlot(new Date(2026, 8, 28, 23, 30)), { slot: 'night', dayKey: '2026-09-28' });
});
