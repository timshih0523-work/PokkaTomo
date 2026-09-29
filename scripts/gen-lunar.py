#!/usr/bin/env python3
# 產生 server/lib/lunarData.js：2024～2099 每年的農曆新年、端午、七夕、中秋（國曆 MMDD）。
# 為什麼不用 JS 內建的 Intl 農曆（ICU）：它在新月剛好接近午夜的年份會差一天
# （2027 春節算成 2/7、2030 算成 2/2，正確是 2/6、2/3）。這裡用 Python lunardate 套件算，
# 是公認的香港天文台資料。重新產生：pip install lunardate && python3 scripts/gen-lunar.py
from lunardate import LunarDate

rows = []
for y in range(2024, 2100):
    ds = [LunarDate(y, 1, 1), LunarDate(y, 5, 5), LunarDate(y, 7, 7), LunarDate(y, 8, 15)]
    rows.append(''.join(d.to_solar_date().strftime('%m%d') for d in ds))

out = '''// lunarData.js — 由 scripts/gen-lunar.py 產生，不要手動改。
// 2024～2099 每年四個農曆節日的國曆日期，每年 16 個數字：春節 MMDD、端午 MMDD、七夕 MMDD、中秋 MMDD。
export const LUNAR_FIRST_YEAR = 2024;
export const LUNAR_DATA =
  '%s';
''' % "' +\n  '".join(' '.join(rows[i:i + 6]) for i in range(0, len(rows), 6))
open('server/lib/lunarData.js', 'w', encoding='utf-8').write(out.replace("' +\n  '", " ' +\n  '"))
print(len(rows), 'years')
