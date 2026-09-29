// voices.js
// 角色的聲音：用瀏覽器內建的語音合成（speechSynthesis），但「挑聲音」這件事以前完全沒做——
// 一律用系統預設的聲音，而且音高還調到 1.15，聽起來很生硬。
//
// 同一台 Mac 上其實有好幾種聲音，品質差很多：
//   ★★★ Premium／Enhanced（優化）：macOS 的神經網路聲音，最像真人。預設沒下載，要到
//        「系統設定 → 輔助使用 → 朗讀內容 → 系統聲音 → 管理聲音」下載（免費、離線可用）。
//        例：美佳（優化）、Meijia (Enhanced)、Kyoko (Enhanced)、O-ren (Premium)
//   ★★  Google 國語（臺灣）／Google 日本語：Chrome 內建，要網路，自然度不錯
//   ★   其他系統聲音（Meijia、Tingting、Kyoko…）：比較機械
// 這裡把可用的聲音依品質排序、預設挑最好的，也讓使用者在設定裡選（每個角色可以不同）。

// 語言 → 要列出哪些聲音（中文排除粵語 zh-HK）
const LANG_PREFIX = { zh: ['zh-TW', 'zh-CN', 'cmn'], ja: ['ja'] };

export function voicesForLanguage(voices, language) {
  const prefixes = LANG_PREFIX[language] || LANG_PREFIX.zh;
  return (voices || []).filter((v) => prefixes.some((p) => String(v.lang || '').replace('_', '-').startsWith(p)));
}

/** 聲音的品質分數（越高越像真人），用來排序與預設挑選 */
export function voiceQuality(v) {
  const name = `${v?.name || ''} ${v?.voiceURI || ''}`;
  let score = 1;
  if (/premium|高品質/i.test(name)) score = 5;
  else if (/enhanced|優化|优化|拡張|siri/i.test(name)) score = 4;
  else if (/google/i.test(name)) score = 3;
  // 台灣口音優先（中文）
  if (/zh-TW/i.test(String(v?.lang || '').replace('_', '-'))) score += 0.5;
  return score;
}

export function sortVoices(voices) {
  return [...voices].sort((a, b) => voiceQuality(b) - voiceQuality(a) || String(a.name).localeCompare(String(b.name)));
}

/** 使用者選的聲音（voiceURI）；沒選或這台電腦沒有 → 自動挑最好的 */
export function pickVoice(voices, language, preferredURI) {
  const list = voicesForLanguage(voices, language);
  if (preferredURI) {
    const hit = list.find((v) => v.voiceURI === preferredURI || v.name === preferredURI);
    if (hit) return hit;
  }
  return sortVoices(list)[0] || null;
}

/** 顯示在選單上的名字：★ 表示品質 */
export function voiceLabel(v) {
  const q = voiceQuality(v);
  const stars = q >= 4 ? '★★★ ' : q >= 3 ? '★★ ' : '';
  return `${stars}${v.name}`;
}

/**
 * 唸之前把不適合唸的東西拿掉：表情符號、波浪號（會被唸成「波浪」或拉很長）、刪節號、括號裡的動作描述。
 */
export function sanitizeForSpeech(text) {
  return String(text || '')
    .replace(/[（(][^）)]{0,20}[）)]/g, ' ') // （眨眨眼）這種動作描述不要唸
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[～~〜]+/g, '，')
    .replace(/[…⋯]+|\.{3,}/g, '，')
    .replace(/[♪♫★☆]/g, '')
    .replace(/，\s*([，。！？!?])/g, '$1')
    .replace(/，{2,}/g, '，')
    .replace(/^[，\s]+|[，\s]+$/g, '')
    .trim();
}

/** 等瀏覽器把聲音清單載入（Chrome 一開始 getVoices() 會是空的） */
export function loadVoices(synth = typeof window !== 'undefined' ? window.speechSynthesis : null, timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (!synth) return resolve([]);
    const now = synth.getVoices();
    if (now.length) return resolve(now);
    const done = () => {
      synth.removeEventListener?.('voiceschanged', done);
      resolve(synth.getVoices());
    };
    synth.addEventListener?.('voiceschanged', done);
    setTimeout(done, timeoutMs);
  });
}
