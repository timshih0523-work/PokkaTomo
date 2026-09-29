// fmService.js
// 封裝所有跟 macOS 內建 Apple Foundation Models（AFM）指令列工具 `fm` 的互動。
// 之後如果 `fm` 的參數改變，或想換成別的本地端 LLM 執行檔，只需要改這個檔案，
// 其他程式都是透過這裡的函式呼叫，不會直接碰 child_process。

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';

import {
  FM_BIN,
  FM_TIMEOUT_MS,
  FM_AVAILABLE_CHECK_TIMEOUT_MS,
  HISTORY_FM_CONTEXT_TURNS,
  PROMPT_HISTORY_BUDGET_CHARS,
  PROMPT_HISTORY_ENTRY_MAX,
  PROMPT_MEMORY_ENTRY_MAX,
  PROMPT_LIST_MAX_CHARS,
  RAG_ENTRY_MAX
} from './config.js';
import { enqueue } from './lib/asyncQueue.js';
import { MOOD_INSTRUCTION } from './lib/mood.js';
import { selfPromptLine, identityRulesLine, styleGuideLine } from './lib/selfKnowledge.js';
import { wearingLine } from './lib/wardrobe.js';
import { relevantPreferences, relevantAnniversaries } from './lib/relevance.js';
import { DEFAULT_PERSONA, companionNameOf } from './profileService.js';
import { weatherPromptLine } from './weatherService.js';
import { log } from './lib/logger.js';

const execFileAsync = promisify(execFile);

/**
 * 檢查系統上的 Apple Foundation Models 是否可用（實際執行一次 `fm available`，不看快取）。
 * 對應規格：啟動時自動執行 `fm available`。
 * @returns {Promise<{available: boolean, raw?: string, error?: string}>}
 */
export async function checkFmAvailable() {
  try {
    const { stdout } = await execFileAsync(FM_BIN, ['available'], { timeout: FM_AVAILABLE_CHECK_TIMEOUT_MS });
    return { available: true, raw: stdout.trim() };
  } catch (err) {
    return {
      available: false,
      error: err.code === 'ENOENT'
        ? `找不到「${FM_BIN}」指令，這台 Mac 可能不支援 Apple Foundation Models，或系統版本太舊。`
        : (err.stderr?.toString().trim() || err.message)
    };
  }
}

// 「目前記得的」fm 可用狀態——單一一份快取，整個 server 共用。
// 之前這份快取是用 server.js 裡的模組級變數自己管理，/api/health 跟 /api/chat
// 各自寫了一次「不可用的話就重查一次」的邏輯，兩邊很容易改一邊忘了改另一邊。
// 現在把快取跟「什麼時候該重查」的規則都收進這個檔案，其他地方只呼叫 getFmStatus() 就好。
let cachedStatus = { available: false, error: '尚未檢查' };

/**
 * 取得目前的 fm 可用狀態。
 * 規則：已知可用的話直接回傳快取（省一次 spawn）；已知不可用的話，
 * 每次呼叫都重新真的檢查一次——因為使用者可能剛打開 Apple Intelligence，
 * 這樣背景輪詢／下一次送訊息才有機會自動偵測到「現在好了」。
 * @param {{forceRecheck?: boolean}} [opts]
 */
export async function getFmStatus({ forceRecheck = false } = {}) {
  if (forceRecheck || !cachedStatus.available) {
    cachedStatus = await checkFmAvailable();
  }
  return cachedStatus;
}

/**
 * 啟動時呼叫一次：把檢查結果放進快取，並印出對應的啟動訊息。
 */
export async function primeFmStatus() {
  cachedStatus = await checkFmAvailable();
  if (cachedStatus.available) {
    log.info('fm_available', { raw: cachedStatus.raw || '' });
  } else {
    log.warn('fm_unavailable', { error: cachedStatus.error });
    console.warn('[fm] 網頁仍會打開，但 PokkaTomo 暫時沒辦法回話，請確認 macOS 版本 / Apple Intelligence 設定。');
  }
  return cachedStatus;
}

const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

/** 超過長度就截斷並加「…」。 */
export function clip(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 清單接成一串，總長超過上限就只放得下的前幾項。 */
function joinWithin(items, max) {
  const out = [];
  let len = 0;
  for (const it of items) {
    if (len + it.length + 1 > max) break;
    out.push(it);
    len += it.length + 1;
  }
  return out.join('、');
}

/**
 * 模型報「上下文太長」的錯誤嗎？（Foundation Models 的 exceededContextWindowSize 之類）
 * 實際的錯誤文字沒有在真機上看過，所以用寬鬆的關鍵字判斷。
 */
export function isContextOverflowError(err) {
  return /context|token|exceed|too long|window/i.test(String(err?.message || err));
}

// 用這台 Mac 的本地時區（不是 UTC），例如「2026-09-28（星期一）21:30」。
export function formatNow(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `（星期${WEEKDAYS_ZH[d.getDay()]}）${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * 依照使用者的個性檔（persona / profile）組出要帶給 `fm respond --instructions` 的系統提示。
 * @param {{persona?: string, profile?: object, memories?: Array<{date: string, text: string}>, weather?: object|null, now?: Date}} params
 *   weather：weatherService.getWeatherForPrompt() 的結果，沒有就不提天氣。
 *   extras：其他情境的補充（節日、親密度的說話風格、今天的占卜、這一輪的生活儀式…），每個元素一行。
 *   memories：最近幾天 PokkaTomo 自己寫的日記（見 diaryService.getRecentMemories），當作「中期記憶」。
 *   now 只是給測試用，平常不用傳（預設現在時間）。
 */
// 聊到穿著打扮（中文、日文）
const WEAR_TOPIC_RE = /穿|衣|服|帽|圍巾|围巾|眼鏡|眼镜|墨鏡|領結|浴衣|圍裙|雨衣|打扮|造型|可愛嗎|好看|着て|着る|帽子|マフラー|メガネ|めがね|似合|おしゃれ|コーデ|ファッション/;

export function buildSystemPrompt({ persona, profile, message = '', memories = [], recalls = [], weather = null, extras = [], now = new Date() } = {}) {
  const lines = [];

  lines.push(persona || profile?.personaPrompt || DEFAULT_PERSONA);

  // 名字另外一行，而且明講「以這個為準」：使用者自己寫的個性描述裡可能還留著舊名字。
  lines.push(`你的名字是「${companionNameOf(profile)}」（如果上面的描述提到別的名字，以這個為準）。`);
  // 角色對自己的認識：長相、胸口的心情燈、會做的事（見 lib/selfKnowledge.js）
  lines.push(selfPromptLine(profile || {}));
  // 身份與說話規則。真機上看到模型說「其實我是個 AI，所以沒有真正的胸口」、每句都用「哈囉～」開頭、
  // 同一件事（幸運色、紀念日）一講再講，這裡明確禁止。
  lines.push(identityRulesLine(companionNameOf(profile)));
  // 衣櫥：只有聊到穿著打扮時才告訴模型現在穿什麼（小模型的提示詞越短越好）
  if (profile?.avatarStyle !== 'classic' && WEAR_TOPIC_RE.test(message)) {
    const wear = wearingLine(profile?.outfit, { date: now });
    if (wear) lines.push(wear);
  }

  if (profile?.nickname) {
    lines.push(`使用者希望你稱呼他/她為「${profile.nickname}」。`);
  }

  // 喜好：記在心上，只有這句話聊到相關的才告訴模型（見 lib/relevance.js）。
  // 以前每句都附上全部喜好＋「找機會提到」，模型就每句都講。
  const prefs = relevantPreferences(profile?.preferences, message);
  if (prefs.length > 0) {
    lines.push(
      `你記得使用者的這些喜好（跟現在聊的有關，可以順口帶到一句，自然就好，不要特地強調）：${joinWithin(prefs, PROMPT_LIST_MAX_CHARS)}。`
    );
  }

  // 以前這裡叫模型「如果剛好接近紀念日可以主動關心」，但從來沒告訴它今天幾號——模型根本
  // 不可能知道接不接近，那句指示等於沒作用。現在把這台 Mac 的本地日期、星期、時間一起帶進去，
  // 順便讓它可以自然地說「這麼晚了還沒睡？」「星期一辛苦了」這種有時間感的話。
  lines.push(`現在時間：${formatNow(now)}。`);
  const weatherLine = weatherPromptLine(weather);
  if (weatherLine) lines.push(weatherLine);

  // 紀念日：只有「今天／這幾天就是」或「這句話問到、提到」時才讓模型知道（見 lib/relevance.js）
  const anns = relevantAnniversaries(profile?.anniversaries, message, now);
  if (anns.length > 0) {
    const md = (a) => `${Number(a.date.slice(5, 7))}月${Number(a.date.slice(8))}日`;
    const items = joinWithin(
      anns.map((a) => `${a.name}（每年${md(a)}${a.noYear ? '' : `，從${a.date.slice(0, 4)}年開始`}${a.daysUntil === 0 ? '，就是今天' : a.daysUntil <= 3 ? `，再${a.daysUntil}天` : ''}）`),
      PROMPT_LIST_MAX_CHARS
    );
    lines.push(`你記得的重要日子：${items}。對方問到或聊到才回答；如果就是今天或快到了，可以溫柔地提一次。`);
  }

  // 中期記憶：短期上下文只有最近幾輪，喜好/紀念日是零碎的事實，中間缺了「前幾天發生過什麼」。
  // 把最近幾天的日記（角色自己的口吻寫的摘要）放進來，牠才會像真的 ポケとも 一樣，
  // 過幾天還能自然地提起「上次你說的那個考試後來怎樣了？」。
  if (Array.isArray(memories) && memories.length > 0) {
    const items = memories.map((m) => `・${m.date}：${clip(m.text, PROMPT_MEMORY_ENTRY_MAX)}`).join('\n');
    lines.push(`以下是你最近幾天寫的日記，是你自己的回憶，放在心上就好；跟現在聊的有關才提：\n${items}`);
  }

  // 長期記憶（RAG，見 ragService.js）：從很久以前的對話／日記裡，找出跟這句話有關的事。
  if (Array.isArray(recalls) && recalls.length > 0) {
    const items = recalls.map((r) => `・${r.date}：${clip(r.text, RAG_ENTRY_MAX)}`).join('\n');
    lines.push(
      `你想起以前跟使用者聊過、可能跟現在這句話有關的事（有關聯才自然地提起，例如「你之前說過…」；不確定就不要提，也不要把舊事當成今天發生的）：\n${items}`
    );
  }

  for (const line of extras) if (line) lines.push(line);

  // 使用者可能中文、日文都會用到，介面上有一個語言切換鈕，切換時會把選擇存進
  // profile.language，這裡依照這個欄位決定「回覆語言」的指示。
  // 不管上面這段人設是用哪種語言寫的，都要求模型只用選定的語言回覆使用者。
  // 說話風格（真機上回覆很生硬、像客服）：給具體的口語規則和兩個示範。
  lines.push(styleGuideLine(profile?.language));

  lines.push(MOOD_INSTRUCTION);

  return lines.join('\n');
}

/**
 * 呼叫 `fm respond`，回傳模型的文字回覆。
 * @param {{message: string, instructions: string, history?: Array<{role: 'user'|'assistant', content: string}>}} params
 */
export function fmRespond({ message, instructions, history = [], purpose = 'chat' }) {
  // 紀錄每次呼叫花多久、成功或失敗（不記內容，見 lib/logger.js）。之後在真的 Mac 上
  // 看紀錄檔就知道模型平均要想幾秒、多常逾時。
  const started = Date.now();
  return runFm({ message, instructions, history }).then(
    (text) => {
      log.info('fm_ok', { purpose, ms: Date.now() - started, promptChars: instructions.length + message.length, replyChars: text.length });
      return text;
    },
    (err) => {
      log.warn('fm_failed', { purpose, ms: Date.now() - started, error: err.message });
      throw err;
    }
  );
}

function runFm({ message, instructions, history }) {
  return new Promise((resolve, reject) => {
    // 短期上下文：把最近幾輪對話折進同一個訊息裡，避免依賴 `fm` 是否真的支援
    // --resume / --save-transcript（不同系統版本可能不一樣），這樣就算沒有也能維持連貫。
    // 對話紀錄裡 AI 自己說過的話標成「你」，不寫角色名字：名字改過之後，舊紀錄裡的舊名字
    // 會讓模型搞不清楚自己是誰。
    // 從最新的往回放，放到總字數預算為止；每則太長的截斷（見 config.js 的 PROMPT_* 說明）。
    const lines = [];
    let used = 0;
    // 占卜卡片（kind: 'fortune'）不放進上下文：以前每次聊天模型都看到「【今日占卜】…」，就一直把占卜掛在嘴邊。
    const relevant = history.filter((h) => h?.kind !== 'fortune');
    for (const h of relevant.slice(-HISTORY_FM_CONTEXT_TURNS).reverse()) {
      const line = `${h.role === 'user' ? '使用者' : '你'}：${clip(h.content, PROMPT_HISTORY_ENTRY_MAX)}`;
      if (used + line.length > PROMPT_HISTORY_BUDGET_CHARS) break;
      lines.unshift(line);
      used += line.length;
    }
    const recentHistory = lines.join('\n');

    const fullMessage = recentHistory
      ? `以下是最近的對話紀錄（「你」是你自己之前說的話），僅供參考上下文，不用重複內容：\n${recentHistory}\n\n使用者現在說：${message}`
      : message;

    const args = ['respond', '--instructions', instructions, fullMessage];
    const child = spawn(FM_BIN, args);

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`fm respond 超過 ${FM_TIMEOUT_MS / 1000} 秒沒有回應，已中止。`));
    }, FM_TIMEOUT_MS);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error(`找不到「${FM_BIN}」指令，請確認這台 Mac 有支援 Apple Foundation Models。`));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `fm respond 結束時發生錯誤（exit code ${code}）`));
      }
    });
  });
}

/**
 * 背景用的 fm 呼叫（關鍵記憶提取、寫日記）一律排進同一條佇列，一次只跑一個。
 * 在 Mac 上同時跑好幾個模型推論會互搶資源，拖慢使用者正在等的那句回覆；聊天本身
 * （前景）不排隊，永遠第一時間處理。
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function runBackgroundFm(task) {
  return enqueue('fm:background', task);
}
