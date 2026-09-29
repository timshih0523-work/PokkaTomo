import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'fs';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
after(() => env.cleanup());
beforeEach(() => env.resetData());
const ps = await import('../server/profileService.js');
const { LIMITS } = await import('../server/config.js');

test('一個角色都沒有：不會自動建立角色，getProfile 回 no_character', async () => {
  rmSync(env.dataDir, { recursive: true, force: true });
  await assert.rejects(ps.getProfile(), (err) => err.code === 'no_character' && err.status === 409);
  const { listCharacters } = await import('../server/characterService.js');
  assert.deepEqual(await listCharacters(), []);
  assert.equal(env.readData('app/characters.json'), undefined, '沒有寫出任何角色');
});

test('新角色什麼都沒改：預設值（稱呼主人、預設個性、沒有城市）', async () => {
  const p = await ps.getProfile();
  assert.equal(p.characterId, '001');
  assert.equal(p.nickname, '主人');
  assert.equal(p.language, 'zh');
  assert.equal(p.personaPrompt, ps.DEFAULT_PERSONA);
  assert.equal(p.location, null);
});

test('角色的設定在 character.json、使用者的在 user.json；自己寫的個性照用，空的用預設', async () => {
  env.writeChar('character.json', { id: '001', name: '毛毛', personaPrompt: '你是傲嬌的貓' });
  env.writeChar('user.json', { nickname: '小美' });
  const p = await ps.getProfile();
  assert.equal(p.personaPrompt, '你是傲嬌的貓');
  assert.equal(p.companionName, '毛毛');
  assert.equal(p.nickname, '小美');
  env.writeChar('character.json', { id: '001', name: '毛毛', personaPrompt: '' });
  assert.equal((await ps.getProfile()).personaPrompt, ps.DEFAULT_PERSONA);
  // 存檔：user.json 只有使用者欄位、character.json 只有角色欄位，時間是人看得懂的格式
  await ps.saveProfile({ nickname: '美美', companionName: '毛毛二號' });
  assert.deepEqual(Object.keys(env.readChar('user.json')), ['nickname', 'uiLanguage', 'location', 'preferences', 'anniversaries']);
  assert.equal(env.readChar('character.json').name, '毛毛二號');
  assert.equal(env.readChar('character.json').nickname, undefined);
  assert.deepEqual(env.readData('app/characters.json'), [{ id: '001', name: '毛毛二號' }]);
});

test('saveProfile 淨化：型別不對的忽略、太長的截斷、不完整的紀念日丟掉', async () => {
  const saved = await ps.saveProfile({
    nickname: '  ' + '名'.repeat(100) + '  ',
    companionName: 123,
    personaPrompt: '個'.repeat(1000),
    preferences: ['草莓', '', 42, '  貓  '],
    anniversaries: [
      { name: '交往紀念日', date: '2024-10-10' },
      { name: '沒日期', date: '' },
      { name: '', date: '2024-01-01' },
      { name: '格式錯', date: '10/10' }
    ],
    firstMetAt: 'not-a-date',
    evil: '<script>'
  });
  assert.equal(saved.nickname.length, LIMITS.nickname);
  assert.equal(saved.companionName, '', '數字的名字被忽略，保留預設');
  assert.equal(saved.personaPrompt.length, LIMITS.persona);
  assert.deepEqual(saved.preferences, ['草莓', '貓']);
  assert.deepEqual(saved.anniversaries, [{ name: '交往紀念日', date: '2024-10-10' }]);
  assert.equal(saved.firstMetAt, null, '格式錯的日期不存（還沒認識＝null）');
  assert.equal(saved.evil, undefined, '不認得的欄位不會被存進去');
});

test('location：合法的存、null 清除、不合法的忽略', async () => {
  await ps.saveProfile({ location: { query: '台北', name: '臺北市', latitude: 25.05, longitude: 121.5 } });
  assert.equal((await ps.getProfile()).location.name, '臺北市');
  await ps.saveProfile({ location: { name: '亂寫', latitude: 'x' } });
  assert.equal((await ps.getProfile()).location.name, '臺北市');
  await ps.saveProfile({ location: null });
  assert.equal((await ps.getProfile()).location, null);
});

test('companionNameOf', () => {
  assert.equal(ps.companionNameOf({}), 'PokkaTomo');
  assert.equal(ps.companionNameOf({ companionName: '  ' }), 'PokkaTomo');
  assert.equal(ps.companionNameOf({ companionName: '小橘' }), '小橘');
});

test('同時儲存設定＋背景記憶提取合併喜好：兩邊的修改都不會遺失', async () => {
  await Promise.all([
    ps.saveProfile({ nickname: '小美' }),
    ps.updateProfile((p) => ({ preferences: [...p.preferences, '草莓'] })),
    ps.saveProfile({ companionName: '小橘' }),
    ps.updateProfile((p) => ({ preferences: [...p.preferences, '貓'] }))
  ]);
  const p = await ps.getProfile();
  assert.equal(p.nickname, '小美');
  assert.equal(p.companionName, '小橘');
  assert.deepEqual(p.preferences, ['草莓', '貓']);
});
