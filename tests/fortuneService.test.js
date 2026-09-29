import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
after(() => env.cleanup());
beforeEach(() => {
  env.resetData();
  env.setFm({ byKind: { fortune: '[mood:joy] 今天很幸運喔！' } });
  env.clearFmCalls();
});
const fs_ = await import('../server/fortuneService.js');
const ps = await import('../server/profileService.js');
const hs = await import('../server/historyService.js');

const day = new Date(2026, 8, 28, 9, 0);

test('第一次抽：fresh，有結果，寫進聊天紀錄一次', async () => {
  const { fortune, fresh } = await fs_.getTodayFortune(day);
  assert.equal(fresh, true);
  assert.ok(['大吉', '中吉', '小吉', '吉', '末吉'].includes(fortune.rankText));
  assert.ok(fortune.number >= 1 && fortune.number <= 9);
  assert.equal(fortune.text, '今天很幸運喔！');
  assert.equal(fortune.mood, 'joy');
  const h = await hs.getAllHistory();
  assert.equal(h.filter((x) => x.kind === 'fortune').length, 1);
  assert.match(h[0].content, /【今日占卜】/);
});

test('同一天再按：同一個結果、不重抽、不重複寫紀錄、不再叫模型', async () => {
  const a = await fs_.getTodayFortune(day);
  env.clearFmCalls();
  const b = await fs_.getTodayFortune(new Date(2026, 8, 28, 22, 0));
  assert.equal(b.fresh, false);
  assert.deepEqual(b.fortune, a.fortune);
  assert.equal(env.fmCalls().length, 0);
  assert.equal((await hs.getAllHistory()).length, 1);
});

test('同一個人同一天抽出來的結果是固定的（用日期當種子），不同天不一定一樣', async () => {
  const a = (await fs_.getTodayFortune(day)).fortune;
  env.resetData();
  const b = (await fs_.getTodayFortune(day)).fortune;
  assert.deepEqual([a.rank, a.color, a.item, a.number], [b.rank, b.color, b.item, b.number]);
  const results = new Set();
  for (let d = 1; d <= 20; d++) {
    env.resetData();
    const f = (await fs_.getTodayFortune(new Date(2026, 9, d))).fortune;
    results.add(`${f.rank}|${f.color}|${f.item}|${f.number}`);
  }
  assert.ok(results.size > 10, `20 天有 ${results.size} 種結果`);
});

test('角色說話的語言跟今天抽的不一樣（例如匯入了日文角色的資料）：抽籤結果不變、用日文重寫', async () => {
  const zh = (await fs_.getTodayFortune(day)).fortune;
  env.writeChar('character.json', { ...env.readChar('character.json'), language: 'ja' });
  const ja = await fs_.getTodayFortune(day);
  assert.equal(ja.fresh, false, '不算重抽，聊天紀錄不會多一張');
  assert.equal(ja.fortune.rank, zh.rank);
  assert.equal(ja.fortune.number, zh.number);
  assert.equal(ja.fortune.lang, 'ja');
  assert.match(ja.fortune.color, /[ァ-ヶ]|抹茶/);
});

test('模型寫說明失敗：改用固定句型，占卜照樣能用', async () => {
  env.setFm({ fail: 'model busy', failKinds: ['fortune'] });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { fortune } = await fs_.getTodayFortune(day);
    assert.match(fortune.text, new RegExp(fortune.rankText));
    assert.match(fortune.text, new RegExp(fortune.item));
  } finally {
    console.warn = warn;
  }
});

test('兩個請求同時來：只抽一次、只呼叫一次模型、紀錄只有一張卡片', async () => {
  env.setFm({ byKind: { fortune: '[mood:joy] 好運' }, delayMs: 200 });
  const [a, b] = await Promise.all([fs_.getTodayFortune(day), fs_.getTodayFortune(day)]);
  assert.deepEqual(a.fortune, b.fortune);
  assert.equal(env.fmCalls().filter((c) => c.kind === 'fortune').length, 1);
  assert.equal((await hs.getAllHistory()).filter((x) => x.kind === 'fortune').length, 1);
});

test('聊天時的 prompt：只有問到運勢才帶；抽過就帶結果，沒抽過就請她按按鈕', () => {
  const today = new Date(2026, 8, 28);
  const state = { fortune: { date: '2026-09-28', rankText: '中吉', color: '粉', item: '傘', number: 3 } };
  assert.equal(fs_.fortunePromptLine(state, '今天好累喔', today), '', '平常聊天不提占卜');
  assert.match(fs_.fortunePromptLine(state, '我今天運勢怎樣？', today), /中吉/);
  assert.match(fs_.fortunePromptLine(state, '今日の運勢は？', today), /中吉/, '日文也認得');
  assert.match(fs_.fortunePromptLine({ fortune: null }, '幫我占卜', today), /🔮/);
  assert.match(fs_.fortunePromptLine({ fortune: { date: '2026-09-27' } }, '幸運色是什麼', today), /🔮/, '昨天的不算');
  assert.equal(fs_.isFortuneTopic('おみくじ引きたい'), true);
  assert.equal(fs_.isFortuneTopic('晚餐吃什麼'), false);
});
