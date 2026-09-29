// api.js
// 前端所有 /api 請求的共同處理：自動帶上「密碼解鎖後拿到的 token」與「現在選的角色」。
//
// 做法是包一層 window.fetch（installApiFetch），所以各元件原本的 fetch('/api/...') 都不用改。
//   X-PokkaTomo-Token      輸入密碼後伺服器給的 token（只放在記憶體：重新整理頁面就要重新輸入密碼）
//   X-PokkaTomo-Character  角色 id（見 server/lib/characterContext.js）
// 伺服器回 401 locked（token 過期、伺服器重開）時通知 App.vue 蓋上密碼畫面。

export const session = {
  token: null,
  characterId: null
};

const lockedListeners = new Set();
export function onLocked(fn) {
  lockedListeners.add(fn);
  return () => lockedListeners.delete(fn);
}

function isApiUrl(input) {
  const url = typeof input === 'string' ? input : input?.url;
  if (!url) return false;
  if (url.startsWith('/api/')) return true;
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin && u.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/** 產生要加上的標頭（測試也用這個） */
export function apiHeaders(existing) {
  const h = new Headers(existing || {});
  if (session.token && !h.has('X-PokkaTomo-Token')) h.set('X-PokkaTomo-Token', session.token);
  if (session.characterId && !h.has('X-PokkaTomo-Character')) h.set('X-PokkaTomo-Character', session.characterId);
  return h;
}

let installed = false;
export function installApiFetch(win = window) {
  if (installed) return;
  installed = true;
  const original = win.fetch.bind(win);
  win.fetch = async (input, init = {}) => {
    if (!isApiUrl(input)) return original(input, init);
    const res = await original(input, { ...init, headers: apiHeaders(init.headers) });
    if (res.status === 401) {
      // 看是不是「需要密碼」（密碼打錯也是 401，但那個由 LockScreen 自己處理）
      const data = await res
        .clone()
        .json()
        .catch(() => null);
      if (data?.error === 'locked') {
        session.token = null;
        for (const fn of lockedListeners) fn();
      }
    }
    return res;
  };
}

/** 下載檔案（匯出 zip）：<a href> 沒辦法帶標頭，所以用 fetch 拿回來再存。 */
export async function downloadFrom(url, fallbackName) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
