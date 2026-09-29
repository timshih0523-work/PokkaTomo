import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'fs';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
after(() => env.cleanup());
beforeEach(() => rmSync(env.dataDir, { recursive: true, force: true }));
const hs = await import('../server/historyService.js');
const ps = await import('../server/profileService.js');
const { HISTORY_MAX_STORED_MESSAGES } = await import('../server/config.js');

test('同時寫入很多則：一則都不會少', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => hs.appendMessages([{ role: 'user', content: `m${i}`, ts: i }])));
  assert.equal((await hs.getAllHistory()).length, 20);
});

test('超過上限只留最新的', async () => {
  const many = Array.from({ length: HISTORY_MAX_STORED_MESSAGES + 5 }, (_, i) => ({ role: 'user', content: `m${i}` }));
  await hs.appendMessages(many);
  const all = await hs.getAllHistory();
  assert.equal(all.length, HISTORY_MAX_STORED_MESSAGES);
  assert.equal(all.at(-1).content, `m${HISTORY_MAX_STORED_MESSAGES + 4}`);
  assert.equal((await hs.getRecentHistory(3)).length, 3);
});

test('記憶提取：模型把 JSON 包在說明文字和 code fence 裡也抓得到，合併進設定（去重、同名紀念日更新日期）', async () => {
  await ps.saveProfile({ preferences: ['貓'], anniversaries: [{ name: '生日', date: '1999-01-01' }] });
  env.setFm({
    byKind: {
      extract:
        '找到了：\n```json\n{"preferences": ["草莓蛋糕", "貓"], "anniversaries": [{"name": "生日", "date": "1999-05-05"}, {"name": "只有月份", "date": "五月"}]}\n```'
    }
  });
  const r = await hs.extractFacts([{ role: 'user', content: '我喜歡草莓蛋糕，生日是 5/5' }]);
  assert.deepEqual(r.preferences, ['草莓蛋糕', '貓']);
  const p = await ps.getProfile();
  assert.deepEqual(p.preferences, ['貓', '草莓蛋糕']);
  assert.deepEqual(p.anniversaries, [{ name: '生日', date: '1999-05-05' }]);
});

test('記憶提取：模型回傳亂七八糟／失敗 → 什麼都不改，不丟例外', async () => {
  await ps.saveProfile({ preferences: ['貓'] });
  env.setFm({ byKind: { extract: '我不知道' } });
  assert.deepEqual(await hs.extractFacts([{ role: 'user', content: 'x' }]), { preferences: [], anniversaries: [] });
  env.setFm({ fail: 'boom' });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await hs.extractFacts([{ role: 'user', content: 'x' }]), { preferences: [], anniversaries: [] });
  } finally {
    console.warn = warn;
  }
  assert.deepEqual((await ps.getProfile()).preferences, ['貓']);
});

test('記憶擷取只看使用者說的話（角色說的幸運色不會變成她的喜好）', async () => {
  env.clearFmCalls();
  env.setFm({ byKind: { extract: '{"preferences": [], "anniversaries": []}' } });
  await hs.extractFacts([
    { role: 'user', content: '很可愛' },
    { role: 'assistant', content: '今天的幸運色是珊瑚橘喔' }
  ]);
  const call = env.fmCalls().find((c) => c.kind === 'extract');
  assert.ok(call.message.includes('很可愛'));
  assert.ok(!call.message.includes('珊瑚橘'), '角色的話沒有送去擷取');
  env.clearFmCalls();
  await hs.extractFacts([{ role: 'assistant', content: '只有角色說話' }]);
  assert.equal(env.fmCalls().filter((c) => c.kind === 'extract').length, 0, '沒有使用者的話就不跑');
});

test('紀念日只有月日：存成今年那天＋noYear；不存在的日期丟掉', () => {
  const now = new Date(2026, 8, 28);
  assert.deepEqual(hs.normalizeAnniversaryDate('紀念日', '05-20', now), { name: '紀念日', date: '2026-05-20', noYear: true });
  assert.deepEqual(hs.normalizeAnniversaryDate('紀念日', '--5-20', now), { name: '紀念日', date: '2026-05-20', noYear: true });
  assert.deepEqual(hs.normalizeAnniversaryDate('生日', '1998-3-5', now), { name: '生日', date: '1998-03-05' });
  assert.equal(hs.normalizeAnniversaryDate('x', '02-30', now), null);
  assert.equal(hs.normalizeAnniversaryDate('x', '五月', now), null);
});

test('擷取到只有月日的紀念日會存進設定（帶 noYear）', async () => {
  env.setFm({ byKind: { extract: '{"preferences": [], "anniversaries": [{"name": "交往紀念日", "date": "05-20"}]}' } });
  await hs.extractFacts([{ role: 'user', content: '520是我們的交往紀念日' }]);
  const ps = await import('../server/profileService.js');
  const a = (await ps.getProfile()).anniversaries.find((x) => x.name === '交往紀念日');
  assert.equal(a.date.slice(5), '05-20');
  assert.equal(a.noYear, true);
});
