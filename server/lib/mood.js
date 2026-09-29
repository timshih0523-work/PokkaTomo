// mood.js
// PokkaTomo 的「情緒通道」：大腦（fm）→ 身體（角色燈光／表情／聲音）。
//
// 真正的 ポケとも 最有辨識度的就是肚子那圈會依心情變色的燈，搭配動作表達共感。
// 以前這個專案的角色只知道「現在在聽／在想／在講話」，完全不知道「這句話是開心還是難過」——
// 使用者說「今天好累」，角色一樣笑咪咪地講完、跳回開心的樣子，共感感覺是假的。
//
// 做法：請 fm 在回覆最前面加一個情緒標籤，例如「[mood:sad] 辛苦了…」，伺服器解析後拿掉標籤，
// 回傳 { reply, mood } 給前端。模型沒照做、標籤寫錯都沒關係：解析失敗就當 calm，
// 文字照常顯示，不會因為這個功能讓對話壞掉。

export const MOODS = ['joy', 'love', 'calm', 'sad', 'worried', 'surprised'];
export const DEFAULT_MOOD = 'calm';

// 放進 system prompt 的說明（fmService / diary / greet 共用同一句，避免三個地方寫法不一樣）。
export const MOOD_INSTRUCTION =
  `回覆的最前面一定要先加一個情緒標籤，格式是 [mood:xxx]，xxx 只能是 ${MOODS.join(' / ')} 其中一個，` +
  '代表你說這句話時的心情（要跟使用者的情緒共感，例如對方難過時用 sad 或 worried，不要硬是開心）。' +
  '標籤後面空一格再接你要說的話，標籤只出現一次。';

// 寬鬆解析：容許 [mood:joy]、【mood：joy】、[joy]、前後空白、大小寫不同。
// i：模型可能寫成 [Mood:joy] 或 [MOOD:JOY]——以前大寫的 MOOD 認不得，整個標籤會留在回覆裡被唸出來。
const TAG_RE = /^\s*[[【]\s*(?:mood|情緒|気分)?\s*[:：]?\s*([a-z]+)\s*[\]】]\s*/i;

/**
 * @param {string} raw fm 回傳的原始文字
 * @returns {{ text: string, mood: string }}
 */
export function parseMoodTag(raw) {
  const text = String(raw || '');
  const m = TAG_RE.exec(text);
  if (!m) return { text: text.trim(), mood: DEFAULT_MOOD };
  const label = m[1].toLowerCase();
  return {
    text: text.slice(m[0].length).trim(),
    mood: MOODS.includes(label) ? label : DEFAULT_MOOD
  };
}
