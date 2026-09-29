// textIndex.js
// 輕量全文檢索（BM25），給 RAG 用（見 ragService.js）。零套件、純記憶體。
//
// 中文、日文沒有空格分詞，這裡用最常見也最穩的做法：「字元 bigram」——
// 「我喜歡吃拉麵」→ 我喜、喜歡、歡吃、吃拉、拉麵。搜「拉麵」就會對到「拉麵」這個 bigram。
// 日文另外處理：平假名多半是助詞、語尾（を、が、ました），先把句子在「平假名／非平假名」
// 交界切開，只拿漢字、片假名的部分做 bigram（「ラーメンを食べた」→ ラー、ーメ、メン、食）。
//
// 中日文混用：她可能今天用中文、明天用日文聊同一件事。很多詞漢字一樣但字形不同
// （天氣／天気、學校／学校、貓／猫），先把常見的繁體字形統一成日文新字體，兩邊就對得起來。
// 完全不同的詞（拉麵／ラーメン）對不起來，這是關鍵字檢索的極限。

// 繁體 → 日文新字體（只收聊天常見的字；兩邊一樣的字不用列）
const VARIANTS =
  '氣気國国學学會会發発寫写讀読實実醫医樂楽戀恋貓猫雞鶏麵麺腦脳聽聴說説對対歲歳圖図驗験檢検險険應応當当來来關関經経' +
  '單単戰戦從従歡歓觀観覺覚變変賣売體体髮髪麥麦黃黄綠緑藥薬澤沢濱浜邊辺區区縣県廣広鐵鉄驛駅營営勞労權権價価錢銭壓圧' +
  '處処聲声齒歯燒焼蟲虫產産歷歴曆暦禮礼將将壽寿狀状裡裏冰氷號号畫画燈灯鹽塩團団轉転傳伝續続顏顔歸帰濟済齊斉圓円' +
  '縣県櫻桜條条惡悪爭争靜静淺浅兒児絲糸譯訳擇択戲戯榮栄紅紅鬥闘豐豊廳庁廚厨緣縁惠恵嚴厳稱称從従隨随險険纖繊';
const VARIANT_MAP = new Map();
for (let i = 0; i + 1 < VARIANTS.length; i += 2) VARIANT_MAP.set(VARIANTS[i], VARIANTS[i + 1]);

// 太常見、沒有意義的 bigram（BM25 的 IDF 也會壓低它們，這裡只是省空間、減少誤判）
const STOP = new Set(
  (
    '我們 你們 他們 她們 今天 什麼 怎麼 因為 所以 可以 覺得 覚得 這個 那個 就是 一下 沒有 真的 還是 然後 現在 如果 不是 知道 自己 ' +
    '一個 有點 一起 時候 這樣 那樣 已經 還有 很好 好的 可能 應該 応該 好像 其實 不過 但是 而且 也是 一直 東西 今日 本当 自分'
  ).split(/\s+/)
);

const HIRAGANA_ONLY = /^[\p{Script=Hiragana}ー]+$/u;
const RUN_RE = /[a-z0-9]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+/gu;
const HIRA_SPLIT_RE = /[\p{Script=Hiragana}]+|[^\p{Script=Hiragana}]+/gu;

export function normalizeText(text) {
  let s = String(text || '').normalize('NFKC').toLowerCase();
  let out = '';
  for (const ch of s) out += VARIANT_MAP.get(ch) || ch;
  return out;
}

/** 文字 → 詞（token）陣列。 */
export function tokenize(text) {
  const tokens = [];
  for (const run of normalizeText(text).match(RUN_RE) || []) {
    if (/^[a-z0-9]+$/.test(run)) {
      if (run.length >= 2) tokens.push(run);
      continue;
    }
    for (const seg of run.match(HIRA_SPLIT_RE) || []) {
      if (HIRAGANA_ONLY.test(seg)) continue; // 平假名（助詞、語尾）不索引
      const chars = [...seg];
      if (chars.length === 1) {
        if (chars[0] !== 'ー') tokens.push(chars[0]);
        continue;
      }
      for (let i = 0; i + 1 < chars.length; i++) {
        const bg = chars[i] + chars[i + 1];
        if (!STOP.has(bg)) tokens.push(bg);
      }
    }
  }
  return tokens;
}

const K1 = 1.2;
const B = 0.75;

/**
 * BM25 索引，可以一筆一筆加、也可以刪（日記重寫時）。
 * doc：{ id, ...任何欄位 }，索引的文字另外傳。
 */
export class Bm25Index {
  constructor() {
    this.docs = new Map(); // id → { doc, len }
    this.postings = new Map(); // term → Map(id → tf)
    this.totalLen = 0;
  }

  get size() {
    return this.docs.size;
  }

  add(doc, text) {
    if (this.docs.has(doc.id)) this.remove(doc.id);
    const tokens = tokenize(text);
    if (!tokens.length) return false;
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [t, n] of tf) {
      if (!this.postings.has(t)) this.postings.set(t, new Map());
      this.postings.get(t).set(doc.id, n);
    }
    this.docs.set(doc.id, { doc, len: tokens.length, terms: [...tf.keys()] });
    this.totalLen += tokens.length;
    return true;
  }

  remove(id) {
    const entry = this.docs.get(id);
    if (!entry) return;
    for (const t of entry.terms) {
      const p = this.postings.get(t);
      p?.delete(id);
      if (p && !p.size) this.postings.delete(t);
    }
    this.totalLen -= entry.len;
    this.docs.delete(id);
  }

  /**
   * @param {string} query
   * @param {{ limit?: number, minScore?: number, minMatched?: number, filter?: (doc) => boolean }} [opts]
   * @returns {Array<{ doc: object, score: number, matched: number }>}
   */
  search(query, { limit = 3, minScore = 0, minMatched = 1, filter } = {}) {
    const N = this.docs.size;
    if (!N) return [];
    const terms = [...new Set(tokenize(query))];
    if (!terms.length) return [];
    const avgdl = this.totalLen / N;
    const scores = new Map(); // id → { score, matched }
    for (const t of terms) {
      const p = this.postings.get(t);
      if (!p) continue;
      const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
      for (const [id, tf] of p) {
        const len = this.docs.get(id).len;
        const s = (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * len) / avgdl));
        const cur = scores.get(id) || { score: 0, matched: 0 };
        cur.score += s;
        cur.matched += 1;
        scores.set(id, cur);
      }
    }
    const out = [];
    for (const [id, { score, matched }] of scores) {
      if (score < minScore || matched < minMatched) continue;
      const { doc } = this.docs.get(id);
      if (filter && !filter(doc)) continue;
      out.push({ doc, score, matched });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
