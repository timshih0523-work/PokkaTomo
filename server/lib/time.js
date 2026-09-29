// time.js
// 「本地日期」相關的小工具。日記、主動問候、紀念日都以這台 Mac 的本地時區為準
// （不能用 toISOString()，那是 UTC——台灣／日本晚上 8 點前後會算成錯的日期）。

/** 例如 2026-09-28 */
export function localDateKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 一天分成四個時段，主動問候每個時段最多一次。
 * 深夜（23:00–04:59）算「night」；凌晨 0～5 點仍算前一天的晚上，避免過了午夜又打一次招呼。
 * @returns {{ slot: 'morning'|'afternoon'|'evening'|'night', dayKey: string }}
 */
export function timeSlot(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 11) return { slot: 'morning', dayKey: localDateKey(d) };
  if (h >= 11 && h < 17) return { slot: 'afternoon', dayKey: localDateKey(d) };
  if (h >= 17 && h < 23) return { slot: 'evening', dayKey: localDateKey(d) };
  const base = h < 5 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1) : d;
  return { slot: 'night', dayKey: localDateKey(base) };
}

/**
 * 存檔用的時間格式：本地時間＋時區，人看得懂，例如 2026-09-29T10:22:20+08:00（精確到秒）。
 * 程式裡面還是用毫秒數字（ts）計算，只有寫進檔案時換成這個、讀出來時換回數字（parseTime）。
 * @param {number|Date|null} t
 * @returns {string|null}
 */
export function toLocalIso(t) {
  if (t === null || t === undefined) return null;
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${localDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
  );
}

/** 檔案裡的時間（ISO 字串；也接受舊的毫秒數字）→ 毫秒數字。讀不懂回傳 null。 */
export function parseTime(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}
