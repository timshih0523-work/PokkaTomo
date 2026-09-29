import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'fs';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
after(() => env.cleanup());
beforeEach(() => {
  rmSync(env.dataDir, { recursive: true, force: true });
  env.setFm({ byKind: { diary: '[mood:love] 今天她說工作好累，我陪她聊了一下。' } });
  env.clearFmCalls();
});
const ds = await import('../server/diaryService.js');
const ps = await import('../server/profileService.js');
const { DIARY_BACKFILL_DAYS } = await import('../server/config.js');

const ts = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test('那天沒聊天 → 不寫、不叫模型', async () => {
  env.writeHistory( [{ role: 'assistant', content: '主動問候', ts: ts(2026, 9, 27) }]);
  assert.equal(await ds.writeDiaryFor('2026-09-27'), null);
  assert.equal(env.fmCalls().length, 0);
});

test('寫日記：只用那一天的對話、存心情；提示詞裡沒有角色名字（改名後舊日記才不會怪）', async () => {
  await ps.saveProfile({ companionName: '小橘', nickname: '小美' });
  env.writeHistory( [
    { role: 'user', content: '前一天的事', ts: ts(2026, 9, 26) },
    { role: 'user', content: '今天工作好累', ts: ts(2026, 9, 27) },
    { role: 'assistant', content: '辛苦了', ts: ts(2026, 9, 27) }
  ]);
  const entry = await ds.writeDiaryFor('2026-09-27');
  assert.equal(entry.mood, 'love');
  assert.equal(entry.text, '今天她說工作好累，我陪她聊了一下。');
  const call = env.fmCalls()[0];
  assert.ok(!call.instructions.includes('小橘') && !call.instructions.includes('PokkaTomo'), '沒有角色名字');
  assert.match(call.instructions, /不要寫出你自己的名字/);
  assert.match(call.message, /使用者：今天工作好累\n我：辛苦了/);
  assert.ok(!call.message.includes('前一天的事'));
});

test('中期記憶：不含今天、新的在前、最多幾篇', async () => {
  env.writeChar('diary.json', [
    { date: '2026-09-24', text: 'a' },
    { date: '2026-09-25', text: 'b' },
    { date: '2026-09-26', text: 'c' },
    { date: '2026-09-27', text: 'd' },
    { date: '2026-09-28', text: '今天的' }
  ]);
  const m = await ds.getRecentMemories(new Date(2026, 8, 28, 20));
  assert.deepEqual(m.map((x) => x.text), ['d', 'c', 'b']);
});

test('補寫過去的日記：只補沒寫過的、不補今天、最多往回幾天', async () => {
  const history = [];
  for (let d = 20; d <= 28; d++) history.push({ role: 'user', content: `9/${d} 的事`, ts: ts(2026, 9, d) });
  env.writeHistory( history);
  env.writeChar('diary.json', [{ date: '2026-09-27', text: '已經寫過' }]);
  await ds.backfillPastDiaries(new Date(2026, 8, 28, 20));
  const dates = (await ds.getDiaries()).map((d) => d.date);
  assert.ok(!dates.includes('2026-09-28'), '今天不自動寫');
  assert.equal((await ds.getDiaries()).find((d) => d.date === '2026-09-27').text, '已經寫過', '寫過的不覆蓋');
  assert.equal(env.fmCalls().length, DIARY_BACKFILL_DAYS);
});

test('今天的日記可以重寫', async () => {
  const now = new Date();
  env.writeHistory( [{ role: 'user', content: '今天的事', ts: now.getTime() }]);
  await ds.writeTodayDiary(now);
  env.setFm({ byKind: { diary: '[mood:joy] 重寫的版本' } });
  await ds.writeTodayDiary(now);
  const all = await ds.getDiaries();
  assert.equal(all.length, 1);
  assert.equal(all[0].text, '重寫的版本');
});
