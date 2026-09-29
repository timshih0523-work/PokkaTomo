// limits.js
// 輸入欄位的字數上限。數字只在後端 server/config.js 的 LIMITS 定義一次，
// 前端一啟動就向 GET /api/config 拿（App.vue 呼叫 loadLimits()），各元件直接讀這裡的 limits。
//
// 還沒拿到之前是 null：輸入框暫時沒有 maxlength，但後端一樣會擋／截斷，不會存進太長的東西。
// 以前前端寫死在各個 .vue 裡、後端另外寫一份，兩邊數字對不上（暱稱前端 20、後端 40）。

import { reactive } from 'vue';

export const limits = reactive({
  message: null,
  nickname: null,
  companionName: null,
  persona: null,
  preference: null,
  preferencesCount: null,
  anniversaryName: null,
  anniversariesCount: null,
  city: null
});

// 同一個 /api/config 順便拿的：這個頁面是不是手機連線開的（lan）、手機的「按住說話」能不能交給 Mac 辨識（serverSpeech）
export const serverFeatures = reactive({ loaded: false, lan: false, serverSpeech: false });

export async function loadLimits(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/api/config');
    if (!res.ok) return false;
    const data = await res.json();
    for (const k of Object.keys(limits)) {
      if (Number.isFinite(data?.limits?.[k])) limits[k] = data.limits[k];
    }
    serverFeatures.lan = data?.lan === true;
    serverFeatures.serverSpeech = data?.serverSpeech === true;
    serverFeatures.loaded = true;
    return true;
  } catch {
    return false;
  }
}

/** 截斷成上限內（上限還沒載入就不截） */
export function clampText(text, max) {
  const s = String(text ?? '');
  return Number.isFinite(max) ? s.slice(0, max) : s;
}
