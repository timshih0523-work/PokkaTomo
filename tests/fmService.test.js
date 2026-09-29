import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv({ extraEnv: { FM_TIMEOUT_MS: '400' } });
after(() => env.cleanup());
const fm = await import('../server/fmService.js');
const { PROMPT_HISTORY_BUDGET_CHARS, PROMPT_LIST_MAX_CHARS } = await import('../server/config.js');

test('buildSystemPrompt：預設人設、名字、稱呼、現在時間、語言、情緒指示', () => {
  const p = fm.buildSystemPrompt({
    profile: { nickname: '小美', companionName: '小橘' },
    now: new Date(2026, 8, 28, 21, 5)
  });
  assert.match(p, /最親近的小夥伴/);
  assert.match(p, /你的名字是「小橘」/);
  assert.match(p, /稱呼他\/她為「小美」/);
  assert.match(p, /2026-09-28（星期一）21:05/);
  assert.match(p, /繁體中文/);
  assert.match(p, /\[mood:xxx\]/);
});

test('沒取名字就叫 PokkaTomo；日文介面要求用日文回覆', () => {
  const p = fm.buildSystemPrompt({ profile: { language: 'ja' } });
  assert.match(p, /你的名字是「PokkaTomo」/);
  assert.match(p, /日本語/);
});

test('天氣、日記回憶、額外情境都會放進去', () => {
  const p = fm.buildSystemPrompt({
    profile: {},
    memories: [{ date: '2026-09-27', text: '她說工作好累' }],
    weather: {
      locationName: '臺北市',
      current: { text: '小雨', temp: 28, feelsLike: 31 },
      today: { text: '下雨', min: 24, max: 29, rainChance: 80 },
      tomorrow: null
    },
    extras: ['今天是聖誕節。', '']
  });
  assert.match(p, /臺北市/);
  assert.match(p, /降雨機率 80%/);
  assert.match(p, /2026-09-27：她說工作好累/);
  assert.match(p, /今天是聖誕節/);
});

test('長度預算：喜好清單、日記有上限（避免超過模型的上下文）', () => {
  const prefs = Array.from({ length: 60 }, (_, i) => `喜好項目第${i}個`);
  const p = fm.buildSystemPrompt({
    profile: { preferences: prefs },
    message: '你還記得我喜歡什麼嗎',
    memories: [{ date: '2026-09-27', text: '記'.repeat(500) }]
  });
  const prefLine = p.split('\n').find((l) => l.startsWith('你記得使用者的這些喜好'));
  assert.ok(prefLine.length < PROMPT_LIST_MAX_CHARS + 40, `喜好那行 ${prefLine.length} 字`);
  assert.ok(!p.includes('記'.repeat(200)), '日記被截斷了');
});

test('clip / isContextOverflowError', () => {
  assert.equal(fm.clip('一二三四五', 3), '一二三…');
  assert.equal(fm.clip('短', 3), '短');
  assert.ok(fm.isContextOverflowError(new Error('exceededContextWindowSize')));
  assert.ok(!fm.isContextOverflowError(new Error('fm respond 超過 30 秒沒有回應')));
});

test('fmRespond：參數格式、對話紀錄折進訊息（標成「使用者」／「你」）', async () => {
  env.clearFmCalls();
  env.setFm({ reply: '[mood:joy] 嗨' });
  const out = await fm.fmRespond({
    message: '現在的話',
    instructions: 'INSTR',
    history: [
      { role: 'user', content: '之前我說' },
      { role: 'assistant', content: '之前你回' }
    ]
  });
  assert.equal(out, '[mood:joy] 嗨');
  const call = env.fmCalls().at(-1);
  assert.deepEqual(call.args.slice(0, 3), ['respond', '--instructions', 'INSTR']);
  assert.match(call.message, /使用者：之前我說\n你：之前你回/);
  assert.match(call.message, /使用者現在說：現在的話$/);
});

test('fmRespond：對話紀錄有總字數上限，保留最新的', async () => {
  env.clearFmCalls();
  env.setFm({});
  const history = Array.from({ length: 8 }, (_, i) => ({ role: 'user', content: `第${i}則` + '長'.repeat(480) }));
  await fm.fmRespond({ message: 'hi', instructions: 'x', history });
  const msg = env.fmCalls().at(-1).message;
  const folded = msg.slice(0, msg.indexOf('使用者現在說'));
  assert.ok(folded.length < PROMPT_HISTORY_BUDGET_CHARS + 120, `折進去 ${folded.length} 字`);
  assert.ok(msg.includes('第7則'), '最新的一則有保留');
  assert.ok(!msg.includes('第0則'), '最舊的被丟掉');
});

test('fmRespond：fm 失敗 → 帶著 stderr 的錯誤；逾時 → 中止', async () => {
  env.setFm({ fail: 'model exploded' });
  await assert.rejects(fm.fmRespond({ message: 'x', instructions: 'y' }), /model exploded/);
  env.setFm({ delayMs: 2000 });
  await assert.rejects(fm.fmRespond({ message: 'x', instructions: 'y' }), /沒有回應/);
});

test('getFmStatus：不可用時每次重查，恢復後才快取', async () => {
  env.setFm({ available: false });
  assert.equal((await fm.getFmStatus()).available, false);
  env.setFm({ available: true });
  assert.equal((await fm.getFmStatus()).available, true, '剛打開 Apple Intelligence 會被偵測到');
  env.setFm({ available: false });
  assert.equal((await fm.getFmStatus()).available, true, '已知可用就用快取，不每次 spawn');
  assert.equal((await fm.getFmStatus({ forceRecheck: true })).available, false);
});

test('prompt 有角色對自己的認識；占卜卡片不放進對話上下文', async () => {
  const { buildSystemPrompt: build, fmRespond: respond } = await import('../server/fmService.js');
  assert.match(build({ profile: { avatarStyle: 'full', palette: 'peach' } }), /心情燈/);
  env.clearFmCalls();
  await respond({
    message: '你胸口的愛心是什麼？',
    instructions: 'x',
    history: [
      { role: 'assistant', content: '【今日占卜】小吉｜幸運色：粉', kind: 'fortune' },
      { role: 'user', content: '早安' }
    ]
  });
  const call = env.fmCalls().at(-1);
  assert.ok(!call.message.includes('今日占卜'));
  assert.ok(call.message.includes('早安'));
});

test('喜好／紀念日平常不放進 prompt，聊到才放', () => {
  const profile = { preferences: ['珍珠奶茶'], anniversaries: [{ name: '交往紀念日', date: '2026-05-20', noYear: true }] };
  const now = new Date(2026, 8, 28);
  const plain = fm.buildSystemPrompt({ profile, message: '今天好累', now });
  assert.ok(!plain.includes('珍珠奶茶'));
  assert.ok(!plain.includes('紀念日'));
  assert.match(fm.buildSystemPrompt({ profile, message: '好想喝奶茶', now }), /珍珠奶茶/);
  const ask = fm.buildSystemPrompt({ profile, message: '我的紀念日是哪天', now });
  assert.match(ask, /交往紀念日（每年5月20日）/);
});

test('衣櫥：聊到穿著時才告訴模型現在穿什麼；自動的部位跟著季節', () => {
  const profile = { outfit: { head: 'auto', neck: 'bowtie', body: 'sweater', face: 'none' } };
  const summer = new Date(2026, 6, 1, 12);
  const asked = fm.buildSystemPrompt({ profile, message: '你今天穿什麼？', now: summer });
  assert.match(asked, /你今天的穿搭：草帽、領結、毛衣/);
  assert.ok(!/穿搭/.test(fm.buildSystemPrompt({ profile, message: '今天好熱', now: summer })), '沒聊到就不放');
  assert.match(fm.buildSystemPrompt({ profile, message: 'その服、似合うね', now: new Date(2026, 0, 10) }), /你今天的穿搭：領結、毛衣/);
  assert.ok(!/穿搭/.test(fm.buildSystemPrompt({ profile: { ...profile, avatarStyle: 'classic' }, message: '你穿什麼', now: summer })), '圓圓的樣子沒有衣服');
});
