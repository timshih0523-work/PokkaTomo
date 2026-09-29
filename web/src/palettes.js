// palettes.js — 角色的毛色（每個角色可以選不同顏色，比較好認）。
// 名稱清單跟後端 server/characterService.js 的 PALETTES 一樣（測試會檢查）。
//   top / bottom：全身角色的漸層上下兩色；mid：舊版圓圓角色的單色；line：描邊
export const PALETTE_COLORS = {
  peach: { top: '#ffe0b2', bottom: '#f6c28a', mid: '#ffd7a3', line: '#9a6a45' },
  cocoa: { top: '#e8cbb0', bottom: '#c2956c', mid: '#d9b08c', line: '#7a5236' },
  cream: { top: '#fff8ec', bottom: '#f0dcbc', mid: '#fbecd2', line: '#a88a63' },
  mint: { top: '#dcf5e9', bottom: '#a7dcc3', mid: '#c4ebd8', line: '#5f8f7a' },
  sakura: { top: '#ffe4ec', bottom: '#f5b6c9', mid: '#fcd0dd', line: '#a8687d' },
  gray: { top: '#eef1f5', bottom: '#c3cad4', mid: '#dbe0e7', line: '#6d7785' }
};
export const PALETTES = Object.keys(PALETTE_COLORS);

/** 角色 SVG 用的 CSS 變數 */
export function paletteStyle(name) {
  const p = PALETTE_COLORS[name] || PALETTE_COLORS.peach;
  return { '--pal-top': p.top, '--pal-bottom': p.bottom, '--pal-mid': p.mid, '--pal-line': p.line };
}
