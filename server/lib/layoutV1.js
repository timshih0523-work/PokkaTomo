// layoutV1.js
// 舊版（v1）資料夾結構 → 現在的結構（v2）。純函式：輸入「舊檔案清單」，輸出「新檔案清單」，不碰硬碟。
// 用在兩個地方：
//   - scripts/migrate-v2.js：把 server/data/ 一次轉成新結構（2026-09 做過一次）
//   - dataAdminService.importBackup()：匯入舊版「匯出所有資料」的 zip 時先轉換
//
// v1（舊）：
//   characters.json                  [{ id:'default'|'c…', name, personaPrompt, avatarStyle, palette, firstMetAt,
//                                       voiceZh, voiceJa, voicePitch, voiceRate, createdAt(毫秒) }]
//   security.json                    密碼
//   user_profile.json、chat_history.json、companion_state.json、diary.json、archive/*.jsonl
//                                    ← 第一個角色（id 'default'）的資料直接放最上層
//   characters/<id>/…                ← 其他角色，檔名一樣
//   （更舊：沒有 characters.json，角色的名字／個性放在 user_profile.json）
// v2（新）：見 lib/characterContext.js 開頭的說明。

import { toLocalIso, parseTime } from './time.js';

const LEGACY_PERSONAS = [
  '你是使用者專屬的貼心小夥伴，性格親切、好奇、溫暖且微帶幽默，說話簡短可愛。'
];
const NEW_DEFAULT_PERSONA = {
  zh: '你是使用者最親近的小夥伴，個性活潑、好奇、有點愛撒嬌，也很會關心人。你有自己的感受和小意見，會開心、會害羞、會吐槽，偶爾開個小玩笑。',
  ja: 'あなたはユーザーのいちばん身近な相棒。明るくて好奇心いっぱい、ちょっと甘えんぼで、相手のことをよく気にかける。自分の気持ちや意見もあって、喜んだり、照れたり、ツッコんだり、たまに冗談も言う。'
};

const text = (buf) => (buf === undefined ? undefined : Buffer.isBuffer(buf) ? buf.toString('utf-8') : String(buf));
function json(files, rel, fallback) {
  const t = text(files[rel]);
  if (t === undefined) return fallback;
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`${rel} 壞掉了，不能轉換`);
  }
}
const out = (data) => `${JSON.stringify(data, null, 2)}`;

/** 這份檔案清單是不是舊版結構？ */
export function isV1Layout(files) {
  const rels = Object.keys(files);
  if (rels.some((r) => r.startsWith('app/'))) return false;
  return rels.some((r) => ['characters.json', 'chat_history.json', 'user_profile.json', 'security.json'].includes(r));
}

// 一行舊的對話紀錄 → 新的一行（ts 數字 → time 字串；占卜說明不再存第二份）
function convertRecord(r) {
  const ts = parseTime(r.time ?? r.ts);
  if (ts === null || typeof r.content !== 'string') return null;
  const o = { id: r.id || `${ts.toString(36)}-m-${r.role === 'user' ? 'u' : 'a'}`, time: toLocalIso(ts), role: r.role === 'user' ? 'user' : 'assistant', content: r.content };
  if (r.mood) o.mood = r.mood;
  if (r.kind) o.kind = r.kind;
  if (r.proactive) o.proactive = r.proactive;
  if (r.fortune && typeof r.fortune === 'object') {
    const { text: _t, createdAt: _c, mood: _m, ...meta } = r.fortune;
    o.fortune = meta;
  }
  return { ts, line: JSON.stringify(o) };
}

function monthOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param {Record<string, Buffer|string>} files  舊結構的檔案（相對 server/data/ 的路徑 → 內容）
 * @returns {{ files: Record<string, string>, report: Array<{ oldId, newId, name, messages, diaries, points }> }}
 */
export function convertV1(files) {
  const result = {};
  const report = [];

  // 角色清單（更舊的版本沒有 characters.json：用 user_profile.json 裡的名字／個性建第一個角色）
  let chars = json(files, 'characters.json', null);
  if (!Array.isArray(chars) || !chars.length) {
    const p = json(files, 'user_profile.json', {}) || {};
    chars = [{ id: 'default', name: p.companionName || '', personaPrompt: p.personaPrompt, avatarStyle: p.avatarStyle, firstMetAt: p.firstMetAt, createdAt: 0 }];
  }

  const index = [];
  chars.forEach((c, i) => {
    const newId = String(i + 1).padStart(3, '0');
    const base = c.id === 'default' ? '' : `characters/${c.id}/`;
    const up = json(files, `${base}user_profile.json`, {}) || {};
    const language = up.language === 'ja' ? 'ja' : 'zh';
    let persona = typeof c.personaPrompt === 'string' && c.personaPrompt.trim() ? c.personaPrompt : NEW_DEFAULT_PERSONA[language];
    if (LEGACY_PERSONAS.includes(persona) || Object.values(NEW_DEFAULT_PERSONA).includes(persona)) persona = NEW_DEFAULT_PERSONA[language];

    const character = {
      id: newId,
      name: typeof c.name === 'string' ? c.name : '',
      language,
      personaPrompt: persona,
      avatarStyle: c.avatarStyle === 'classic' ? 'classic' : 'full',
      palette: c.palette || 'peach',
      voice: (language === 'ja' ? c.voiceJa : c.voiceZh) || '',
      voicePitch: Number.isFinite(c.voicePitch) ? c.voicePitch : 1.05,
      voiceRate: Number.isFinite(c.voiceRate) ? c.voiceRate : 1.0,
      firstMetAt: c.firstMetAt || up.firstMetAt || null,
      createdAt: Number.isFinite(c.createdAt) && c.createdAt > 0 ? toLocalIso(c.createdAt) : null
    };
    const dir = `characters/${newId}/`;
    result[`${dir}character.json`] = out(character);

    result[`${dir}user.json`] = out({
      nickname: typeof up.nickname === 'string' ? up.nickname : '',
      uiLanguage: up.uiLanguage && up.uiLanguage !== language ? up.uiLanguage : null,
      location: up.location || null,
      preferences: Array.isArray(up.preferences) ? up.preferences : [],
      anniversaries: Array.isArray(up.anniversaries) ? up.anniversaries : []
    });

    const st = json(files, `${base}companion_state.json`, null);
    let points = 0;
    if (st && typeof st === 'object') {
      points = st.points || 0;
      result[`${dir}state.json`] = out({
        points: st.points || 0,
        daily: st.daily || { date: null, chatPoints: 0, patPoints: 0 },
        streak: st.streak || { lastDay: null, days: 0 },
        totals: st.totals || { messages: 0, pats: 0, touches: {} },
        sleepingSince: toLocalIso(parseTime(st.sleepingSince)),
        leftAt: toLocalIso(parseTime(st.leftAt)),
        fortune: st.fortune ? { ...st.fortune, createdAt: toLocalIso(parseTime(st.fortune.createdAt)) } : null
      });
    }

    const diary = json(files, `${base}diary.json`, null);
    let diaries = 0;
    if (Array.isArray(diary)) {
      diaries = diary.length;
      result[`${dir}diary.json`] = out(diary.map((e) => ({ ...e, createdAt: toLocalIso(parseTime(e.createdAt)) })));
    }

    // 對話：以永久封存（archive/）為準；沒有封存（很舊的版本）才用 chat_history.json
    const records = [];
    const archivePrefix = `${base}archive/`;
    const archiveFiles = Object.keys(files).filter((r) => r.startsWith(archivePrefix) && /^\d{4}-\d{2}\.jsonl$/.test(r.slice(archivePrefix.length))).sort();
    if (archiveFiles.length) {
      for (const f of archiveFiles) {
        for (const line of text(files[f]).split('\n')) {
          if (!line.trim()) continue;
          try {
            const r = convertRecord(JSON.parse(line));
            if (r) records.push(r);
          } catch {
            /* 壞掉的行跳過（跟程式讀檔時一樣） */
          }
        }
      }
    } else {
      const hist = json(files, `${base}chat_history.json`, []);
      for (const h of Array.isArray(hist) ? hist : []) {
        const r = convertRecord(h);
        if (r) records.push(r);
      }
    }
    records.sort((a, b) => a.ts - b.ts);
    const byMonth = {};
    for (const r of records) (byMonth[monthOf(r.ts)] ||= []).push(r.line);
    for (const [m, lines] of Object.entries(byMonth)) result[`${dir}conversations/${m}.jsonl`] = `${lines.join('\n')}\n`;

    index.push({ id: newId, name: character.name });
    report.push({ oldId: c.id, newId, name: character.name, messages: records.length, diaries, points });
  });

  result['app/characters.json'] = out(index);
  const sec = json(files, 'security.json', null);
  if (sec && typeof sec === 'object') result['app/security.json'] = out({ ...sec, updatedAt: toLocalIso(parseTime(sec.updatedAt)) });

  return { files: result, report };
}
