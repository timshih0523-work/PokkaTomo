// 舊結構（v1）→ 新結構（v2）的轉換（server/lib/layoutV1.js；scripts/migrate-v2.js 與匯入舊 zip 共用）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertV1, isV1Layout } from '../../server/lib/layoutV1.js';

const t = (y, m, d, h = 10) => new Date(y, m - 1, d, h).getTime();
const jsonl = (rows) => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
const fortune = { date: '2026-09-29', lang: 'ja', rank: 'shokichi', rankText: '小吉', color: 'さくらピンク', item: 'イヤホン', number: 3, text: 'いい日だね', mood: 'calm', createdAt: t(2026, 9, 29) };

// 跟 2026-09 她 Mac 上的資料一樣的形狀：第一個角色在最上層、其他角色在 characters/<亂碼 id>/
const v1 = {
  'characters.json': JSON.stringify([
    { id: 'default', name: '毛毛', personaPrompt: '你是使用者最親近的小夥伴，個性活潑、好奇、有點愛撒嬌，也很會關心人。你有自己的感受和小意見，會開心、會害羞、會吐槽，偶爾開個小玩笑。', avatarStyle: 'full', palette: 'mint', firstMetAt: '2026-09-28', voiceZh: '月', voiceJa: 'Kyoko', voicePitch: 1.05, voiceRate: 1.1, createdAt: 0 },
    { id: 'cabc123xyz', name: '小熊', personaPrompt: '你是溫柔的老師', avatarStyle: 'classic', palette: 'sakura', firstMetAt: null, voiceZh: '', voiceJa: '', voicePitch: 1.05, voiceRate: 1, createdAt: t(2026, 9, 28) }
  ]),
  'security.json': JSON.stringify({ algo: 'scrypt', salt: 'aa', pinHash: 'bb', updatedAt: t(2026, 9, 28) }),
  // 最上層的 user_profile.json 還留著升級前的角色欄位（companionName、舊的預設個性…），轉換後要清掉
  'user_profile.json': JSON.stringify({ nickname: '小美', companionName: '毛毛', personaPrompt: '舊的', preferences: [], anniversaries: [{ name: '紀念日', date: '2026-06-17', noYear: true }], language: 'ja', uiLanguage: 'zh', location: { name: '台北市', latitude: 25, longitude: 121 }, firstMetAt: '2026-09-28', avatarStyle: 'full' }),
  'chat_history.json': JSON.stringify([{ role: 'user', content: '我說呢', ts: t(2026, 9, 26) }]),
  'archive/2026-09.jsonl': jsonl([
    { id: 'a1', ts: t(2026, 9, 26), role: 'user', content: '我說呢' },
    { id: 'a2', ts: t(2026, 9, 26), role: 'assistant', content: '喔！你好喔～', mood: 'joy' },
    { id: 'a3', ts: t(2026, 9, 29), role: 'assistant', content: '【今日占卜】小吉\nいい日だね', kind: 'fortune', fortune, mood: 'calm' }
  ]),
  'archive/2026-08.jsonl': jsonl([{ id: 'a0', ts: t(2026, 8, 31), role: 'user', content: '八月的話' }]),
  'companion_state.json': JSON.stringify({ points: 39, daily: { date: '2026-09-29', chatPoints: 0, patPoints: 6 }, streak: { lastDay: '2026-09-28', days: 1 }, totals: { messages: 20, pats: 29, touches: { head: 4 } }, sleepingSince: null, leftAt: t(2026, 9, 29, 8), fortune }),
  'diary.json': JSON.stringify([{ date: '2026-09-28', text: '今天…', mood: 'worried', createdAt: t(2026, 9, 28, 21) }]),
  'characters/cabc123xyz/user_profile.json': JSON.stringify({ nickname: 'ご主人さま', language: 'ja', location: null, preferences: [], anniversaries: [] }),
  'characters/cabc123xyz/chat_history.json': JSON.stringify([{ role: 'user', content: 'こんにちは', ts: t(2026, 9, 28) }]),
  'characters/cabc123xyz/archive/2026-09.jsonl': jsonl([{ id: 'b1', ts: t(2026, 9, 28), role: 'user', content: 'こんにちは' }]),
  'characters/cabc123xyz/companion_state.json': JSON.stringify({ points: 9 })
};

const parse = (files, rel) => JSON.parse(files[rel]);
const lines = (files, rel) => files[rel].trim().split('\n').map((l) => JSON.parse(l));

test('看得出是舊結構；新結構不會被當成舊的', () => {
  assert.equal(isV1Layout(v1), true);
  assert.equal(isV1Layout({ 'app/characters.json': '[]', 'characters/001/character.json': '{}' }), false);
});

test('每個角色都變成 characters/001、002…，同樣的檔案；app/ 放共用的', () => {
  const { files, report } = convertV1(v1);
  assert.deepEqual(Object.keys(files).sort(), [
    'app/characters.json',
    'app/security.json',
    'characters/001/character.json',
    'characters/001/conversations/2026-08.jsonl',
    'characters/001/conversations/2026-09.jsonl',
    'characters/001/diary.json',
    'characters/001/state.json',
    'characters/001/user.json',
    'characters/002/character.json',
    'characters/002/conversations/2026-09.jsonl',
    'characters/002/state.json',
    'characters/002/user.json'
  ]);
  assert.deepEqual(parse(files, 'app/characters.json'), [{ id: '001', name: '毛毛' }, { id: '002', name: '小熊' }]);
  assert.deepEqual(report.map((r) => [r.oldId, r.newId, r.messages, r.diaries, r.points]), [
    ['default', '001', 4, 1, 39],
    ['cabc123xyz', '002', 1, 0, 9]
  ]);
});

test('character.json：說話的語言搬進來、只留那個語言的聲音、預設個性換成那個語言的、時間人看得懂', () => {
  const { files } = convertV1(v1);
  const c1 = parse(files, 'characters/001/character.json');
  assert.equal(c1.language, 'ja');
  assert.equal(c1.voice, 'Kyoko');
  assert.match(c1.personaPrompt, /^あなたは/, '中文的預設個性 → 日文角色用日文的預設');
  assert.equal(c1.createdAt, null, '0（不知道）→ null');
  assert.equal(c1.firstMetAt, '2026-09-28');
  const c2 = parse(files, 'characters/002/character.json');
  assert.equal(c2.personaPrompt, '你是溫柔的老師', '自己寫的個性不動');
  assert.match(c2.createdAt, /^2026-09-28T10:00:00[+-]\d{2}:\d{2}$/);
});

test('user.json：只留使用者的欄位（舊的角色欄位清掉）；介面語言跟說話語言一樣時存 null', () => {
  const { files } = convertV1(v1);
  const u1 = parse(files, 'characters/001/user.json');
  assert.deepEqual(Object.keys(u1), ['nickname', 'uiLanguage', 'location', 'preferences', 'anniversaries']);
  assert.equal(u1.nickname, '小美');
  assert.equal(u1.uiLanguage, 'zh');
  assert.equal(u1.anniversaries[0].noYear, true);
  assert.equal(parse(files, 'characters/002/user.json').uiLanguage, null);
});

test('對話：以封存為準（chat_history.json 不再另存）、ts → time、占卜說明只存一次', () => {
  const { files } = convertV1(v1);
  const sep = lines(files, 'characters/001/conversations/2026-09.jsonl');
  assert.deepEqual(sep.map((r) => r.id), ['a1', 'a2', 'a3']);
  assert.match(sep[0].time, /^2026-09-26T10:00:00[+-]\d{2}:\d{2}$/);
  assert.equal(sep[0].ts, undefined);
  assert.equal(sep[2].fortune.text, undefined);
  assert.equal(sep[2].fortune.rankText, '小吉');
  assert.equal(lines(files, 'characters/001/conversations/2026-08.jsonl')[0].content, '八月的話');
});

test('state.json、diary.json、security.json 的時間都換成人看得懂的格式', () => {
  const { files } = convertV1(v1);
  const st = parse(files, 'characters/001/state.json');
  assert.equal(st.points, 39);
  assert.match(st.leftAt, /^2026-09-29T08:00:00/);
  assert.match(st.fortune.createdAt, /^2026-09-29T10:00:00/);
  assert.match(parse(files, 'characters/001/diary.json')[0].createdAt, /^2026-09-28T21:00:00/);
  assert.match(parse(files, 'app/security.json').updatedAt, /^2026-09-28T10:00:00/);
  assert.equal(parse(files, 'app/security.json').pinHash, 'bb');
});

test('更舊的版本（沒有 characters.json、沒有封存）也能轉', () => {
  const { files, report } = convertV1({
    'user_profile.json': JSON.stringify({ nickname: '小美', companionName: '毛毛', personaPrompt: '你是使用者專屬的貼心小夥伴，性格親切、好奇、溫暖且微帶幽默，說話簡短可愛。' }),
    'chat_history.json': JSON.stringify([{ role: 'user', content: '舊的話', ts: t(2026, 8, 1) }])
  });
  assert.equal(parse(files, 'characters/001/character.json').name, '毛毛');
  assert.match(parse(files, 'characters/001/character.json').personaPrompt, /^你是使用者最親近的小夥伴/, '舊的預設個性換成新的');
  assert.equal(report[0].messages, 1);
  assert.equal(lines(files, 'characters/001/conversations/2026-08.jsonl')[0].content, '舊的話');
});
