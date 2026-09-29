import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, normalizeText, Bm25Index } from '../../server/lib/textIndex.js';

test('中文：字元 bigram，常見詞（今天）不索引', () => {
  const t = tokenize('今天想吃拉麵');
  assert.ok(t.includes('拉麺'), '麵 會統一成日文字形 麺');
  assert.ok(t.includes('想吃'));
  assert.ok(!t.includes('今天'));
});

test('日文：平假名（助詞、語尾）不索引，漢字／片假名才索引', () => {
  assert.deepEqual(tokenize('ラーメンを食べた'), ['ラー', 'ーメ', 'メン', '食']);
  assert.deepEqual(tokenize('ですね'), []);
});

test('繁體與日文字形統一：天氣＝天気、貓＝猫', () => {
  assert.equal(normalizeText('天氣'), normalizeText('天気'));
  assert.deepEqual(tokenize('貓咪'), tokenize('猫咪'));
});

test('英文與數字：小寫、兩個字以上', () => {
  assert.deepEqual(tokenize('I love Pokemon 2026 a'), ['love', 'pokemon', '2026']);
  assert.deepEqual(tokenize('ＡＢＣ'), ['abc'], '全形轉半形');
});

test('BM25：找得到相關的、不相關的不出現', () => {
  const ix = new Bm25Index();
  const docs = ['我很喜歡吃豚骨拉麵', '今天去學校考試好緊張', '我養了一隻貓叫小花', '下個月要去東京旅行', '工作好累老闆一直加班'];
  docs.forEach((t, i) => ix.add({ id: i, t }, t));
  assert.equal(ix.size, 5);
  assert.equal(ix.search('想吃拉麵')[0].doc.t, docs[0]);
  assert.equal(ix.search('小花最近好嗎')[0].doc.t, docs[2]);
  assert.equal(ix.search('東京好玩嗎')[0].doc.t, docs[3]);
  assert.deepEqual(ix.search('嗯嗯'), []);
  // 中文問、日文寫的也對得到（同樣的漢字）
  ix.add({ id: 9, t: '猫の小花' }, '猫の小花がかわいい');
  assert.ok(ix.search('小花好可愛').some((r) => r.doc.id === 9));
});

test('BM25：可以刪除、重複加入會覆蓋、filter 與門檻', () => {
  const ix = new Bm25Index();
  ix.add({ id: 'a' }, '草莓蛋糕');
  ix.add({ id: 'b' }, '草莓牛奶');
  ix.add({ id: 'a' }, '巧克力蛋糕');
  assert.equal(ix.size, 2);
  assert.ok(!ix.search('草莓').some((r) => r.doc.id === 'a'));
  ix.remove('b');
  assert.deepEqual(ix.search('草莓'), []);
  ix.remove('nope');
  assert.equal(ix.search('巧克力', { filter: () => false }).length, 0);
  assert.equal(ix.search('巧克力', { minScore: 99 }).length, 0);
  assert.equal(ix.add({ id: 'c' }, 'のです'), false, '沒有可以索引的字就不加');
  assert.deepEqual(new Bm25Index().search('草莓'), []);
});
