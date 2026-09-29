// outfits.js — 衣櫥：每個角色自己的穿搭（存在後端 character.json 的 outfit，規則見 server/lib/wardrobe.js）。
//
// 四個部位，每個部位的值：'auto'（自動）| 'none'（不戴）| 衣服的 id。畫法在 FullBodyAvatar.vue
// （舊版圓圓的角色只畫得出節日帽子，其他都沒有）。清單跟後端一樣（測試會檢查）。
// 自動：
//   頭：今天是節日就戴節日配件（聖誕帽、萬聖節帽、櫻花髮夾），不然換季帽子（春 小花冠、夏 草帽、秋 貝雷帽、冬 沒有）
//   脖子：冬天（12～2 月）圍巾
//   衣服、臉：沒有
// 自己選了某件就一直穿那件（節日也不換）。月份用這台電腦的本地時間。

export const WARDROBE_SLOTS = ['head', 'neck', 'body', 'face'];

export const WARDROBE_ITEMS = {
  head: ['flowers', 'strawhat', 'beret', 'beanie', 'ribbon', 'crown', 'sakura', 'santa', 'witch'],
  neck: ['scarf', 'bowtie', 'bell', 'bandana'],
  body: ['tshirt', 'sweater', 'yukata', 'apron', 'raincoat'],
  face: ['roundglasses', 'sunglasses', 'heartglasses']
};

export const DEFAULT_OUTFIT = Object.freeze({ head: 'auto', neck: 'auto', body: 'auto', face: 'auto' });

export function sanitizeOutfit(raw) {
  const out = { ...DEFAULT_OUTFIT };
  if (!raw || typeof raw !== 'object') return out;
  for (const slot of WARDROBE_SLOTS) {
    const v = raw[slot];
    if (v === 'auto' || v === 'none' || WARDROBE_ITEMS[slot].includes(v)) out[slot] = v;
  }
  return out;
}

/** 今天的節日配件（沒有節日回傳 null）。events 是 /api/companion 回傳的節日 id。 */
export function holidayHeadFor(events = []) {
  if (events.includes('christmas') || events.includes('christmasEve')) return 'santa';
  if (events.includes('halloween')) return 'witch';
  if (events.includes('sakura')) return 'sakura';
  return null;
}

/** 換季帽子（冬天沒有帽子，改成脖子上的圍巾） */
export function seasonalOutfit(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'flowers';
  if (m >= 6 && m <= 8) return 'strawhat';
  if (m >= 9 && m <= 11) return 'beret';
  return 'scarf';
}

/**
 * 實際穿在身上的東西：{ head, neck, body, face }，每個是衣服 id 或 null。
 * @param {object} outfit 角色的 outfit 設定
 * @param {{ events?: string[], date?: Date }} [opts]
 */
export function resolveOutfit(outfit, { events = [], date = new Date() } = {}) {
  const o = sanitizeOutfit(outfit);
  const season = seasonalOutfit(date);
  const auto = {
    head: holidayHeadFor(events) || (season === 'scarf' ? null : season),
    neck: season === 'scarf' ? 'scarf' : null,
    body: null,
    face: null
  };
  const worn = {};
  for (const slot of WARDROBE_SLOTS) worn[slot] = o[slot] === 'auto' ? auto[slot] : o[slot] === 'none' ? null : o[slot];
  return worn;
}
