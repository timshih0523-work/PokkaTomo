import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, appendFileSync } from 'fs';
import path from 'path';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
const history = await import('../server/historyService.js');
const archive = await import('../server/archiveService.js');
const { HISTORY_MAX_STORED_MESSAGES } = await import('../server/config.js');
after(() => env.cleanup());

const convDir = () => env.charFile('conversations');

test('寫入：依月份分檔，一行一則，時間是人看得懂的格式', async () => {
  await history.appendMessages([
    { role: 'user', content: '舊的一句', ts: new Date(2026, 7, 31, 10, 5, 7).getTime() },
    { role: 'assistant', content: '舊的回覆', mood: 'joy', ts: new Date(2026, 7, 31, 10, 5, 7).getTime() }
  ]);
  const ts = new Date(2026, 8, 2, 9).getTime();
  await history.appendMessages([
    { role: 'user', content: '新的一句', ts },
    { role: 'assistant', content: '新的回覆', mood: 'calm', ts }
  ]);
  assert.deepEqual(readdirSync(convDir()).sort(), ['2026-08.jsonl', '2026-09.jsonl']);
  const first = JSON.parse(readFileSync(path.join(convDir(), '2026-08.jsonl'), 'utf-8').split('\n')[0]);
  assert.deepEqual(Object.keys(first), ['id', 'time', 'role', 'content']);
  assert.match(first.time, /^2026-08-31T10:05:07[+-]\d{2}:\d{2}$/);
  const all = await archive.readArchive();
  assert.deepEqual(all.map((r) => r.content), ['舊的一句', '舊的回覆', '新的一句', '新的回覆']);
  assert.equal(all[1].mood, 'joy');
  assert.equal(all[0].ts, new Date(2026, 7, 31, 10, 5, 7).getTime(), '讀回來換回毫秒數字');
  assert.ok(all.every((r) => r.id && r.ts));
});

test('對話只存一份：沒有 chat_history.json；「最近的對話」從對話檔讀、有上限', async () => {
  const base = new Date(2026, 8, 3).getTime();
  const many = Array.from({ length: HISTORY_MAX_STORED_MESSAGES + 10 }, (_, i) => ({ role: 'user', content: `第${i}則`, ts: base + i * 1000 }));
  await history.appendMessages(many);
  const recent = await history.getAllHistory();
  assert.equal(recent.length, HISTORY_MAX_STORED_MESSAGES);
  assert.equal(recent.at(-1).content, `第${many.length - 1}則`);
  assert.deepEqual((await history.getRecentHistory(3)).map((r) => r.content), [`第${many.length - 3}則`, `第${many.length - 2}則`, `第${many.length - 1}則`]);
  const all = await archive.readArchive();
  assert.ok(all.some((r) => r.content === '第0則'));
  assert.equal(all.length, 4 + many.length);
  assert.ok(!readdirSync(env.charFile('')).includes('chat_history.json'));
});

test('占卜：說明文字只存在 content，fortune 裡不再存一份；讀出來會補回去', async () => {
  const fortune = { date: '2026-09-05', lang: 'zh', rank: 'daikichi', rankText: '大吉', color: '紅', item: '傘', number: 7, text: '今天超棒！', mood: 'joy', createdAt: 1 };
  await archive.appendToArchive([{ role: 'assistant', content: '【今日占卜】大吉｜…\n今天超棒！', kind: 'fortune', fortune, mood: 'joy', ts: new Date(2026, 8, 5, 8).getTime() }]);
  const line = readFileSync(path.join(convDir(), '2026-09.jsonl'), 'utf-8').trim().split('\n').at(-1);
  assert.equal(JSON.parse(line).fortune.text, undefined);
  assert.equal(line.split('今天超棒！').length, 2, '說明文字只出現一次');
  const rec = (await archive.readArchiveDay('2026-09-05')).at(-1);
  assert.equal(rec.fortune.text, '今天超棒！');
  assert.equal(rec.fortune.rankText, '大吉');
});

test('壞掉的一行跳過，不影響其他行；監聽者收到新紀錄', async () => {
  appendFileSync(path.join(convDir(), '2026-09.jsonl'), '{壞掉的\n');
  const before = (await archive.readArchive()).length;
  const got = [];
  const off = archive.onArchiveAppend((r) => got.push(...r));
  await archive.appendToArchive([{ role: 'user', content: 'hi', ts: new Date(2026, 8, 5).getTime() }, { role: 'user', content: '' }]);
  off();
  assert.equal(got.length, 1, '空內容不存');
  assert.equal((await archive.readArchive()).length, before + 1);
  assert.ok(readFileSync(path.join(convDir(), '2026-09.jsonl'), 'utf-8').includes('{壞掉的'), '壞掉的行不會被改動或刪除');
});
