// useAvatarHit.js
// 角色的「感應區」點擊／滑過判斷，兩隻角色（SvgAvatar、FullBodyAvatar）共用。
// 規則：只有點到帶 data-part 的元素才算摸到角色（點角色旁邊的空白不算）；
// 滑鼠在同一個部位上移動不重複觸發 hover，離開角色再回來才會再觸發。

/** @param {(event: 'touch'|'hover', payload: { part: string, side: string|null }) => void} emit */
export function useAvatarHit(emit) {
  function partFrom(event) {
    const el = event?.target?.closest?.('[data-part]');
    return el ? { part: el.getAttribute('data-part'), side: el.getAttribute('data-side') || null } : null;
  }

  function emitTouch(part, side = null) {
    emit('touch', { part, side: side || null });
  }

  function onClick(event) {
    const hit = partFrom(event);
    if (hit) emitTouch(hit.part, hit.side);
  }

  let lastHover = null;
  function onPointerOver(event) {
    const hit = partFrom(event);
    const key = hit ? `${hit.part}:${hit.side}` : null;
    if (hit && key !== lastHover) emit('hover', hit);
    lastHover = key;
  }
  function onPointerOut(event) {
    if (!event?.relatedTarget?.closest?.('[data-part]')) lastHover = null;
  }

  return { onClick, onPointerOver, onPointerOut, emitTouch };
}
