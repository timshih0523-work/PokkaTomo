import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsOn, eventsPromptLine, lunarFestivals } from '../../server/lib/seasons.js';

const ids = (y, m, d) => eventsOn(new Date(y, m - 1, d)).map((e) => e.id);

test('國曆固定節日', () => {
  assert.deepEqual(ids(2026, 12, 25), ['christmas']);
  assert.deepEqual(ids(2026, 12, 24), ['christmasEve']);
  assert.deepEqual(ids(2026, 10, 31), ['halloween']);
  assert.deepEqual(ids(2027, 1, 2), ['newYear']);
  assert.deepEqual(ids(2026, 7, 7), ['tanabata']);
});

test('賞櫻季是一段期間', () => {
  assert.ok(ids(2026, 3, 25).includes('sakura'));
  assert.ok(ids(2026, 4, 10).includes('sakura'));
  assert.ok(!ids(2026, 4, 11).includes('sakura'));
});

test('農曆節日（跟 lunardate 算出來的對照）', () => {
  assert.ok(ids(2026, 9, 25).includes('midAutumn'));
  assert.ok(ids(2026, 8, 19).includes('qixi'));
  assert.ok(ids(2026, 6, 19).includes('dragonBoat'));
  assert.ok(ids(2028, 10, 3).includes('midAutumn'));
});

test('農曆新年：除夕到初三都算，不會重複出現', () => {
  // 2027 年春節是 2/6
  for (const d of [5, 6, 7, 8]) {
    const list = ids(2027, 2, d);
    assert.equal(list.filter((x) => x === 'lunarNewYear').length, 1, `2/${d}`);
  }
  assert.ok(!ids(2027, 2, 9).includes('lunarNewYear'));
  assert.ok(!ids(2027, 2, 4).includes('lunarNewYear'));
});

test('平常日沒有節日、prompt 不加任何東西', () => {
  assert.deepEqual(ids(2026, 9, 28), []);
  assert.equal(eventsPromptLine([]), '');
});

test('有節日時 prompt 會提到', () => {
  assert.match(eventsPromptLine(eventsOn(new Date(2026, 11, 25))), /聖誕節/);
});

// 以前寫死在程式裡的表（Python lunardate 算的），現在改成產生到 2099 年的資料，確認前十年完全一樣。
const OLD_TABLE = {
  2026: { lunarNewYear: '02-17', dragonBoat: '06-19', qixi: '08-19', midAutumn: '09-25' },
  2027: { lunarNewYear: '02-06', dragonBoat: '06-09', qixi: '08-08', midAutumn: '09-15' },
  2028: { lunarNewYear: '01-26', dragonBoat: '05-28', qixi: '08-26', midAutumn: '10-03' },
  2029: { lunarNewYear: '02-13', dragonBoat: '06-16', qixi: '08-16', midAutumn: '09-22' },
  2030: { lunarNewYear: '02-03', dragonBoat: '06-05', qixi: '08-05', midAutumn: '09-12' },
  2031: { lunarNewYear: '01-23', dragonBoat: '06-24', qixi: '08-24', midAutumn: '10-01' },
  2032: { lunarNewYear: '02-11', dragonBoat: '06-12', qixi: '08-12', midAutumn: '09-19' },
  2033: { lunarNewYear: '01-31', dragonBoat: '06-01', qixi: '08-01', midAutumn: '09-08' },
  2034: { lunarNewYear: '02-19', dragonBoat: '06-20', qixi: '08-20', midAutumn: '09-27' },
  2035: { lunarNewYear: '02-08', dragonBoat: '06-10', qixi: '08-10', midAutumn: '09-16' }
};

test('農曆資料跟舊的 2026–2035 表完全一樣', () => {
  for (const [y, row] of Object.entries(OLD_TABLE)) {
    assert.deepEqual(lunarFestivals(Number(y)), row, `${y}`);
    for (const [id, md] of Object.entries(row)) {
      const [m, d] = md.split('-').map(Number);
      assert.ok(ids(Number(y), m, d).includes(id), `${y}-${md} 應該是 ${id}`);
      // 前一天不是（除了除夕算春節）
      if (id !== 'lunarNewYear') assert.ok(!ids(Number(y), m, d - 1).includes(id), `${y}-${md} 前一天不該是 ${id}`);
    }
  }
});

test('2035 年以後也算得出來（不會過期）', () => {
  // 2040 年中秋節是 9/20、春節是 2/12
  assert.ok(ids(2040, 9, 20).includes('midAutumn'));
  assert.ok(ids(2040, 2, 12).includes('lunarNewYear'));
});

test('超出資料範圍（2100 年以後）不會壞掉，只是沒有農曆節日', () => {
  assert.equal(lunarFestivals(2100), null);
  assert.equal(lunarFestivals(2023), null);
  assert.deepEqual(ids(2100, 12, 25), ['christmas']);
});
