// seasons.js
// 節日與季節活動。角色知道「今天是什麼日子」，會在問候、聊天裡自然提起；前端會換上對應的裝飾
// （聖誕帽、飄雪、櫻花瓣、月亮…，見 web/src/components/SeasonDecor.vue）。
//
// 使用者是台灣＋日本的情侶，所以兩邊的節日都放：
//   - 國曆固定日期：新年、情人節、白色情人節、女兒節（日本 3/3）、七夕（日本 7/7）、萬聖節、聖誕節、跨年
//   - 大約的季節：賞櫻（3/25～4/10）
//   - 農曆節日：農曆新年、端午節、七夕情人節（台灣）、中秋節——每年國曆日期不同。
//     日期來自 lib/lunarData.js（scripts/gen-lunar.py 用 Python lunardate 產生，涵蓋 2024～2099，
//     之後不用再維護）。本來想直接用 JS 內建的 Intl 農曆（ICU），但它在新月剛好接近午夜的年份
//     會差一天（2027 春節算成 2/7、2030 算成 2/2），測試抓到之後改回用算好的資料。
//
// 回傳的 id 是語言無關的代碼，前端依 id 決定裝飾跟顯示的名字；name 是給模型看的中文描述。

import { LUNAR_DATA, LUNAR_FIRST_YEAR } from './lunarData.js';

const LUNAR_IDS = ['lunarNewYear', 'dragonBoat', 'qixi', 'midAutumn'];
const LUNAR_ROWS = LUNAR_DATA.split(' ');

/**
 * 某一年的四個農曆節日（國曆 MM-DD）；超出資料範圍回傳 null。
 * @param {number} year
 * @returns {{ lunarNewYear: string, dragonBoat: string, qixi: string, midAutumn: string } | null}
 */
export function lunarFestivals(year) {
  const row = LUNAR_ROWS[year - LUNAR_FIRST_YEAR];
  if (!row || year < LUNAR_FIRST_YEAR) return null;
  const out = {};
  LUNAR_IDS.forEach((id, i) => (out[id] = `${row.slice(i * 4, i * 4 + 2)}-${row.slice(i * 4 + 2, i * 4 + 4)}`));
  return out;
}

// [id, 開始 MM-DD, 結束 MM-DD, 給模型看的說明]
const FIXED = [
  ['newYear', '01-01', '01-03', '新年（元旦、日本的お正月）'],
  ['valentine', '02-14', '02-14', '西洋情人節'],
  ['hinamatsuri', '03-03', '03-03', '日本的女兒節（ひな祭り）'],
  ['whiteDay', '03-14', '03-14', '白色情人節'],
  ['sakura', '03-25', '04-10', '賞櫻的季節（お花見）'],
  ['tanabata', '07-07', '07-07', '日本的七夕（七月七日）'],
  ['halloween', '10-31', '10-31', '萬聖節'],
  ['christmasEve', '12-24', '12-24', '聖誕夜'],
  ['christmas', '12-25', '12-25', '聖誕節'],
  ['yearEnd', '12-31', '12-31', '跨年夜（日本的大晦日）']
];

const LUNAR_DESC = {
  lunarNewYear: '農曆新年（春節）',
  dragonBoat: '端午節',
  qixi: '農曆七夕（台灣的情人節）',
  midAutumn: '中秋節（日本的十五夜，可以賞月）'
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * 某一天（本地日期）有哪些節日。
 * @param {Date} d
 * @returns {Array<{ id: string, desc: string }>}
 */
export function eventsOn(d = new Date()) {
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const out = [];
  for (const [id, start, end, desc] of FIXED) {
    if (md >= start && md <= end) out.push({ id, desc });
  }
  const lunar = lunarFestivals(d.getFullYear());
  if (lunar) {
    for (const [id, date] of Object.entries(lunar)) {
      if (date === md) out.push({ id, desc: LUNAR_DESC[id] });
      // 農曆新年一連過好幾天：除夕到初三都算
      if (id === 'lunarNewYear') {
        const [m, day] = date.split('-').map(Number);
        const start = new Date(d.getFullYear(), m - 1, day - 1);
        const end = new Date(d.getFullYear(), m - 1, day + 3);
        const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (today >= start && today < end && date !== md) out.push({ id, desc: LUNAR_DESC[id] });
      }
    }
  }
  return out;
}

/** 放進 system prompt 的一行；沒有節日就回空字串。 */
export function eventsPromptLine(events) {
  if (!events?.length) return '';
  return `今天是${events.map((e) => e.desc).join('、')}。聊天時可以自然地提起、祝對方節日快樂，但不用每句都講。`;
}
