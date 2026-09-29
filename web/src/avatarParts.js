// avatarParts.js
// 角色「被摸到哪裡」的共用詞彙。
//
// 角色元件（現在的 SvgAvatar，之後的全身角色、3D／VRM）只負責判斷「點到的是哪個部位」，
// 用這裡的部位名稱發出 touch 事件；「摸到那裡要有什麼反應」（台詞、小動作、親密度）
// 由 App.vue 依部位決定。所以之後換成全身角色時：
//   1. 新角色在自己的元件裡標好各部位（SVG 用 data-part、3D 用 raycast 打到的骨架/網格名稱）
//   2. 名稱不一樣的話在 PART_ALIASES 加對照（例如 3D 模型的 'LeftHand' → 'hand'）
//   3. 新部位（例如 tail）要有反應的話，在 i18n.js 的 partReactions 補台詞
// App.vue 的觸摸邏輯完全不用動。

/** 支援的部位。back 目前沒有角色用到（正面角色點不到背），預留給之後可以轉身的 3D 角色。 */
export const PARTS = ['head', 'face', 'cheek', 'ear', 'belly', 'body', 'hand', 'foot', 'tail', 'back'];

/** 各角色實際標出來的部位（測試會檢查這些都有台詞、而且跟 .vue 裡的 data-part 一致）。 */
export const CLASSIC_AVATAR_PARTS = ['head', 'face', 'cheek', 'ear', 'belly', 'body'];
export const FULL_BODY_PARTS = ['head', 'face', 'cheek', 'ear', 'belly', 'body', 'hand', 'foot', 'tail'];
/** 舊名稱，保留相容 */
export const CURRENT_AVATAR_PARTS = FULL_BODY_PARTS;

// 其他角色（3D 模型的骨架名稱、別的畫法）可能用不同的名字，統一對照成上面的名稱。
const PART_ALIASES = {
  hair: 'head',
  forehead: 'head',
  eye: 'face',
  eyes: 'face',
  nose: 'face',
  mouth: 'face',
  chest: 'belly',
  tummy: 'belly',
  stomach: 'belly',
  arm: 'hand',
  arms: 'hand',
  hands: 'hand',
  finger: 'hand',
  leg: 'foot',
  legs: 'foot',
  feet: 'foot',
  torso: 'body'
};

/**
 * 把任何角色回報的部位名稱整理成 { part, side }。
 * 認得左右：'leftHand'、'left_ear'、'Ear.L'、'ear-r' 都可以。認不得的部位當成 'body'。
 * @param {string} raw
 * @param {'left'|'right'|null} [side]
 * @returns {{ part: string, side: 'left'|'right'|null }}
 */
export function normalizePart(raw, side = null) {
  let name = String(raw || '').trim();
  let s = side;
  const lower = name.toLowerCase();
  if (!s) {
    if (/^left|[._-]l$|[._-]left$/.test(lower)) s = 'left';
    else if (/^right|[._-]r$|[._-]right$/.test(lower)) s = 'right';
  }
  name = lower
    .replace(/^(left|right)[._-]?/, '')
    .replace(/[._-](l|r|left|right)$/, '');
  const part = PARTS.includes(name) ? name : PART_ALIASES[name] || 'body';
  return { part, side: s === 'left' || s === 'right' ? s : null };
}
