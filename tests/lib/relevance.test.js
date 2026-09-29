import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevantPreferences, relevantAnniversaries } from '../../server/lib/relevance.js';

const P = ['珍珠奶茶', '貓', '日本動漫'];

test('喜好：只有聊到相關的才帶；問「我喜歡什麼」全部帶', () => {
  assert.deepEqual(relevantPreferences(P, '今天好累'), []);
  assert.deepEqual(relevantPreferences(P, '晚餐吃什麼'), []);
  assert.deepEqual(relevantPreferences(P, '我家的貓今天好可愛'), ['貓']);
  assert.deepEqual(relevantPreferences(P, '好想喝奶茶'), ['珍珠奶茶']);
  assert.deepEqual(relevantPreferences(P, '你記得我喜歡什麼嗎'), P);
  assert.deepEqual(relevantPreferences(P, ''), []);
  assert.deepEqual(relevantPreferences(undefined, '貓'), []);
});

const A = [
  { name: '交往紀念日', date: '2026-05-20', noYear: true },
  { name: '媽媽生日', date: '1970-10-05' }
];
const now = new Date(2026, 8, 28);
const names = (m, n = now) => relevantAnniversaries(A, m, n).map((a) => a.name);

test('紀念日：平常不帶；問到紀念日、寫到日期、提到名字才帶', () => {
  assert.deepEqual(names('晚上好'), []);
  assert.deepEqual(names('今天上班好累'), []);
  assert.deepEqual(names('我的紀念日是什麼時候'), ['交往紀念日', '媽媽生日']);
  for (const m of ['520要去哪', '5/20那天', '5月20日', '05-20']) assert.deepEqual(names(m), ['交往紀念日'], m);
  assert.deepEqual(names('今天是1520號'), [], '不是 520');
  assert.deepEqual(names('媽媽最近好嗎'), ['媽媽生日']);
});

test('紀念日：今天或 3 天內就算沒問也帶（可以主動提一次）', () => {
  const r = relevantAnniversaries(A, '你好', new Date(2026, 4, 18));
  assert.equal(r.length, 1);
  assert.equal(r[0].daysUntil, 2);
  assert.equal(relevantAnniversaries(A, '你好', new Date(2026, 4, 20))[0].daysUntil, 0);
});
