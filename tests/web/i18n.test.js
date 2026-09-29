import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, LANGUAGES, getStrings } from '../../web/src/i18n.js';

// 遞迴比對兩份字典的結構：少一個 key，切到那個語言時畫面就會出現 undefined
function shape(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix + k;
    if (Array.isArray(v)) out.push(`${key}:array`);
    else if (v && typeof v === 'object') out.push(...shape(v, key + '.'));
    else out.push(`${key}:${typeof v}`);
  }
  return out.sort();
}

test('每個語言的字典結構完全一樣（沒有漏翻的 key、型別一致）', () => {
  const base = shape(STRINGS[LANGUAGES[0]]);
  for (const lang of LANGUAGES.slice(1)) assert.deepEqual(shape(STRINGS[lang]), base, lang);
});

test('陣列類的台詞（反應、夢話、小動作）每個語言都不是空的', () => {
  for (const lang of LANGUAGES) {
    const t = STRINGS[lang];
    for (const key of ['reactions', 'reactionsLv3', 'reactionsLv5', 'errorReactions', 'sleepTalk', 'sleepMumble', 'levelTitles']) {
      assert.ok(t[key].length > 0, `${lang}.${key}`);
    }
    for (const [name, lines] of Object.entries(t.quirkLines)) assert.ok(lines.length > 0, `${lang}.quirkLines.${name}`);
  }
});

test('等級名稱有 6 個（對應後端的 6 級）', () => {
  for (const lang of LANGUAGES) assert.equal(STRINGS[lang].levelTitles.length, 6);
});

test('{name} 會換成角色名字：字串、巢狀、陣列、函式回傳值都換', () => {
  const t = getStrings('zh', '小橘');
  assert.equal(t.hintBusy, '小橘 正在忙，等一下下～');
  assert.equal(t.diary.title, '小橘 的日記');
  assert.ok(t.greetingDay.includes('小橘'));
  assert.ok(t.growth.levelUpBody.includes('小橘'));
  const all = JSON.stringify(t, (k, v) => (typeof v === 'function' ? v(1, 'x') : v));
  assert.ok(!all.includes('{name}'), '沒有漏換的佔位符');
});

test('沒取名字 → 用該語言的預設名字；前後空白當成沒填', () => {
  assert.equal(getStrings('zh').diary.title, 'PokkaTomo 的日記');
  assert.equal(getStrings('ja', '   ').diary.title, 'ポッカともの日記');
});

test('不認得的語言退回中文', () => {
  assert.equal(getStrings('xx').label, '中文');
});

test('函式型的文字照常運作', () => {
  const t = getStrings('ja');
  assert.match(t.growth.label(3, t.levelTitles[2]), /Lv\.3/);
  assert.match(t.anniversaryToday('記念日', 2), /2 年/);
  assert.match(t.settings.cityNotFound('どこ'), /どこ/);
});
