import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoodTag, MOODS, DEFAULT_MOOD, MOOD_INSTRUCTION } from '../../server/lib/mood.js';

test('標準格式的情緒標籤會被拿掉，情緒另外回傳', () => {
  assert.deepEqual(parseMoodTag('[mood:sad] 辛苦了…'), { text: '辛苦了…', mood: 'sad' });
});

test('全形括號、日文「気分」、大小寫、沒有 mood: 前綴都認得', () => {
  assert.deepEqual(parseMoodTag('【気分：surprised】えっ！'), { text: 'えっ！', mood: 'surprised' });
  assert.deepEqual(parseMoodTag('[MOOD:Joy]  好耶'), { text: '好耶', mood: 'joy' });
  assert.deepEqual(parseMoodTag('[love]喜歡你'), { text: '喜歡你', mood: 'love' });
});

test('沒有標籤：文字照常、情緒是預設的 calm', () => {
  assert.deepEqual(parseMoodTag('沒有標籤'), { text: '沒有標籤', mood: DEFAULT_MOOD });
});

test('不認得的情緒 → calm，但標籤一樣拿掉', () => {
  assert.deepEqual(parseMoodTag('[mood:angry] 哼'), { text: '哼', mood: 'calm' });
});

test('標籤在句子中間不算（只看開頭）', () => {
  assert.equal(parseMoodTag('中間 [mood:sad] 不算').mood, 'calm');
});

test('只有標籤沒有內容 → 文字是空字串（chat 路由會當成錯誤處理）', () => {
  assert.equal(parseMoodTag('[mood:joy]').text, '');
});

test('null / undefined 不會丟例外', () => {
  assert.deepEqual(parseMoodTag(undefined), { text: '', mood: 'calm' });
});

test('給模型的指示列出所有情緒', () => {
  for (const m of MOODS) assert.ok(MOOD_INSTRUCTION.includes(m), m);
});
