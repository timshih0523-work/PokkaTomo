// rituals.js
// 生活儀式：早安、我出門了、我回來了、晚安。
//
// 參考 Gatebox（おはよう／いってきます／ただいま／おやすみ 各有對應反應，おやすみ 之後進入睡眠模式）
// 跟 LOVOT（回家時跑到門口迎接）。這幾句話每天都會講，角色每次都「接得住」，陪伴感會差很多：
//   - 出門：說路上小心（會下雨就提醒帶傘），記下出門時間，回來時可以說「歡迎回來，出去了 N 小時耶」
//   - 回家：歡迎回來，如果早上說過要出門，問問今天過得怎樣
//   - 晚安：溫柔地道晚安，然後角色真的去睡覺（前端 ASLEEP 狀態、會說夢話），隔天早上才醒
//   - 早安：回早安，順口提今天的天氣或行程
//
// 判斷方式故意用簡單的關鍵字：整句很短、而且以這些詞為主的時候才算（「我回來了」算，
// 「我回來了之後一直在想工作的事」不算——後者是在聊別的事，照一般聊天處理比較自然）。

const RITUALS = {
  morning: ['早安', '早上好', '早呀', '早阿', '早啊', 'おはよう', 'おはようございます', 'おはよー', 'good morning'],
  leaving: ['我出門了', '我出門囉', '我要出門了', '出門囉', '出門了', '我走了', '我去上班了', '我去上學了', 'いってきます', '行ってきます', 'いってくるね', '行ってくるね', 'いってくる'],
  home: ['我回來了', '我回來囉', '我到家了', '回來了', '到家了', 'ただいま', 'ただいまー', '帰ったよ', '帰ってきたよ'],
  goodnight: ['晚安', '我要睡了', '我去睡了', '睡覺了', '要睡囉', 'おやすみ', 'おやすみなさい', 'おやすみー', '寝るね', 'もう寝る', 'good night']
};

// 比對前先拿掉標點、語助詞、emoji、空白，讓「晚安～」「おやすみ！」「晚安啦 😴」都認得出來。
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s、。，,.!！?？~～…ー\-]+$/gu, '')
    .replace(/[\p{Extended_Pictographic}\s、。，,.!！?？~～…]/gu, '')
    .replace(/(啦|囉|喔|哦|呀|唷|ね|よ|ー)+$/u, '');
}

const MAX_RITUAL_LEN = 12; // 正規化後超過這個長度就當作一般聊天

/**
 * @param {string} message
 * @returns {'morning'|'leaving'|'home'|'goodnight'|null}
 */
export function detectRitual(message) {
  const text = normalize(message);
  if (!text || text.length > MAX_RITUAL_LEN) return null;
  for (const [type, words] of Object.entries(RITUALS)) {
    for (const w of words) {
      const nw = normalize(w);
      if (text === nw) return type;
      // 「這個詞 + 很短的補充」（例如「晚安明天見」）也算。但只剩一個字的詞（「早呀」去掉語助詞變「早」）
      // 只接受完全相同，不然「早餐吃什麼」會被當成早安。
      if (nw.length < 2) continue;
      if ((text.startsWith(nw) && text.length - nw.length <= 4) || (text.endsWith(nw) && text.length - nw.length <= 3)) {
        return type;
      }
    }
  }
  return null;
}

/**
 * 這一輪要額外給模型的提示（讓回覆符合儀式的情境）。
 * @param {string|null} ritual
 * @param {{ awayHours?: number|null }} ctx 出門到現在幾小時（回家時用）
 */
export function ritualPromptLine(ritual, { awayHours = null } = {}) {
  switch (ritual) {
    case 'morning':
      return '使用者在跟你說早安。開心地回早安，可以順口提今天的天氣或關心今天的安排，一兩句就好。';
    case 'leaving':
      return '使用者要出門了。簡短地說路上小心、早點回來（如果今天會下雨就提醒帶傘），不要問問題拖住對方，一兩句就好。';
    case 'home':
      return awayHours != null
        ? `使用者剛回到家（大約出門了 ${awayHours} 小時）。很開心地說歡迎回來，問問今天過得怎麼樣。`
        : '使用者剛回到家。很開心地說歡迎回來，問問今天過得怎麼樣。';
    case 'goodnight':
      return '使用者要去睡覺了。溫柔地道晚安（可以說一句貼心的話），一兩句就好，不要再問問題讓對方回覆。你說完之後也會去睡覺。';
    default:
      return '';
  }
}
