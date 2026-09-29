import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
const day = (d, h = 12) => new Date(2026, 7, d, h).getTime();
env.writeChar('diary.json', [
  { date: '2026-08-03', text: '今天她說下個月要去東京旅行，好期待。', mood: 'joy', createdAt: 0 },
  { date: '2026-08-04', text: '她的貓小花生病了，我也好擔心。', mood: 'worried', createdAt: 0 }
]);
const { appendMessages } = await import('../server/historyService.js');
const rag = await import('../server/ragService.js');
after(() => env.cleanup());

const written = await appendMessages([
  { role: 'user', content: '我最喜歡吃豚骨拉麵了', ts: day(1) },
  { role: 'assistant', content: '豚骨拉麵好好吃！', mood: 'joy', ts: day(1) },
  { role: 'user', content: '明天要考數學考試好緊張', ts: day(2) },
  { role: 'assistant', content: '加油！你一定可以的', mood: 'love', ts: day(2) },
  { role: 'assistant', content: '早安～', ts: day(2, 8), proactive: '2026-08-02:morning' }
]);

test('想得起很久以前的對話', async () => {
  const r = await rag.recall('好想吃拉麵喔');
  assert.equal(r[0].source, 'chat');
  assert.equal(r[0].date, '2026-08-01');
  assert.match(r[0].text, /豚骨拉麵/);
  assert.match(r[0].text, /你回/);
});

test('想得起日記；不相關的話不硬扯', async () => {
  const r = await rag.recall('東京好玩嗎');
  assert.equal(r[0].source, 'diary');
  assert.match(r[0].text, /^（你的日記）/);
  assert.deepEqual(await rag.recall('嗯嗯'), []);
  assert.deepEqual(await rag.recall('あのね'), []);
});

test('已經在上下文裡的不重複：excludeIds（紀錄的 id）、excludeDates', async () => {
  assert.equal((await rag.recall('拉麵', { excludeIds: [written[0].id] })).length, 0);
  assert.ok(!(await rag.recall('小花還好嗎', { excludeDates: ['2026-08-04'] })).some((r) => r.date === '2026-08-04'));
});

test('新訊息馬上可以被想起（增量索引）；日記改了會重建', async () => {
  await rag.recall('拉麵'); // 確保索引已建好
  await appendMessages([
    { role: 'user', content: '我下週要去大阪看環球影城', ts: day(10) },
    { role: 'assistant', content: '好棒！', ts: day(10) }
  ]);
  assert.match((await rag.recall('大阪好玩嗎'))[0].text, /環球影城/);

  env.writeChar('diary.json', [{ date: '2026-08-11', text: '她說想學做蛋糕。', mood: 'joy', createdAt: 0 }]);
  const diary = await import('../server/diaryService.js');
  env.setFm({ byKind: { diary: '[mood:joy] 今天她說想學做草莓蛋糕' } });
  await appendMessages([{ role: 'user', content: '想學做蛋糕', ts: day(12) }]);
  await diary.writeDiaryFor('2026-08-12');
  const r = await rag.recall('草莓蛋糕怎麼做');
  assert.ok(r.some((x) => x.source === 'diary' && x.date === '2026-08-12'));
});

test('占卜、主動問候不會被當成她說過的事', async () => {
  const r = await rag.recall('早安');
  assert.ok(!r.some((x) => x.text.includes('早安～')));
});
