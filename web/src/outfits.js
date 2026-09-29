// outfits.js — 換季服裝（沒有節日配件的時候戴）。月份用這台電腦的本地時間。
//   3～5 月 flowers 小花冠、6～8 月 strawhat 草帽、9～11 月 beret 貝雷帽、12～2 月 scarf 圍巾
// 畫法在 FullBodyAvatar.vue（舊版圓圓的角色沒有換季服裝）。
export const SEASONAL_OUTFITS = ['flowers', 'strawhat', 'beret', 'scarf'];

export function seasonalOutfit(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'flowers';
  if (m >= 6 && m <= 8) return 'strawhat';
  if (m >= 9 && m <= 11) return 'beret';
  return 'scarf';
}
