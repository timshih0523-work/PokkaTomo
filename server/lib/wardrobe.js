// wardrobe.js — 衣櫥（每個角色自己選穿搭，存在 character.json 的 outfit）。
//
// 四個部位，每個部位的值：'auto'（自動：跟著季節／節日）| 'none'（不戴）| 衣服的 id。
// 前端 web/src/wardrobe.js 有同一份清單（畫法在 FullBodyAvatar.vue），測試會檢查兩邊一樣。
// 自動的規則（前端也一樣）：
//   頭：節日配件（聖誕帽、萬聖節帽、櫻花髮夾；只有前端知道今天是什麼節日）→ 沒有節日就換季帽子（春花冠、夏草帽、秋貝雷帽、冬天沒有）
//   脖子：冬天（12～2 月）圍巾，其他季節不戴
//   衣服、臉：不穿／不戴
// 使用者自己選了某件，就一直穿那件（節日也不換）。

export const WARDROBE_SLOTS = ['head', 'neck', 'body', 'face'];

export const WARDROBE_ITEMS = {
  head: ['flowers', 'strawhat', 'beret', 'beanie', 'ribbon', 'crown', 'sakura', 'santa', 'witch'],
  neck: ['scarf', 'bowtie', 'bell', 'bandana'],
  body: ['tshirt', 'sweater', 'yukata', 'apron', 'raincoat'],
  face: ['roundglasses', 'sunglasses', 'heartglasses']
};

// 給模型看的名字（「你現在穿著…」）。系統提示是中文寫的，所以只要中文。
const ITEM_WORDS = {
  flowers: '小花冠',
  strawhat: '草帽',
  beret: '貝雷帽',
  beanie: '毛線帽',
  ribbon: '蝴蝶結髮飾',
  crown: '小皇冠',
  sakura: '櫻花髮夾',
  santa: '聖誕帽',
  witch: '魔女帽',
  scarf: '圍巾',
  bowtie: '領結',
  bell: '鈴鐺項圈',
  bandana: '領巾',
  tshirt: 'T 恤',
  sweater: '毛衣',
  yukata: '浴衣',
  apron: '圍裙',
  raincoat: '雨衣',
  roundglasses: '圓眼鏡',
  sunglasses: '墨鏡',
  heartglasses: '愛心眼鏡'
};

export const DEFAULT_OUTFIT = Object.freeze({ head: 'auto', neck: 'auto', body: 'auto', face: 'auto' });

/** 淨化：只留四個部位，值要是 auto／none／那個部位的衣服；其他都當成 auto。 */
export function sanitizeOutfit(raw) {
  const out = { ...DEFAULT_OUTFIT };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const slot of WARDROBE_SLOTS) {
    const v = raw[slot];
    if (v === 'auto' || v === 'none' || WARDROBE_ITEMS[slot].includes(v)) out[slot] = v;
  }
  return out;
}

function seasonOf(date) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/**
 * 實際穿在身上的東西（每個部位一個 id 或 null）。
 * @param {object} outfit character.json 的 outfit
 * @param {{ date?: Date, holidayHead?: string|null }} [opts] holidayHead：今天的節日配件（前端才知道；後端不給）
 */
export function resolveOutfit(outfit, { date = new Date(), holidayHead = null } = {}) {
  const o = sanitizeOutfit(outfit);
  const season = seasonOf(date);
  const auto = {
    head: holidayHead || { spring: 'flowers', summer: 'strawhat', autumn: 'beret', winter: null }[season],
    neck: season === 'winter' ? 'scarf' : null,
    body: null,
    face: null
  };
  const worn = {};
  for (const slot of WARDROBE_SLOTS) worn[slot] = o[slot] === 'auto' ? auto[slot] : o[slot] === 'none' ? null : o[slot];
  return worn;
}

/** 給模型的一句話：現在穿什麼（什麼都沒穿就回傳空字串）。被問到穿什麼、換衣服時才用得到。 */
export function wearingLine(outfit, opts) {
  const worn = resolveOutfit(outfit, opts);
  const words = WARDROBE_SLOTS.map((s) => worn[s] && ITEM_WORDS[worn[s]]).filter(Boolean);
  if (!words.length) return '';
  return `你今天的穿搭：${words.join('、')}（使用者可以用「衣櫥」幫你換衣服）。被問到穿什麼時照這個回答，不用主動一直提。`;
}
