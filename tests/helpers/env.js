// test/helpers/env.js
// 每個測試檔最前面呼叫 setupTestEnv()，再用 await import() 載入要測的程式。
//
// 做的事：
//   1. 建一個暫存資料夾當 POKKATOMO_DATA_DIR——測試只會讀寫這裡，絕對不會碰到 server/data 裡使用者真正的資料
//   2. 放一個假的 `fm` 指令（見 fakeFm.js）當 FM_BIN，行為可以在測試中途改（setFm）、每次呼叫都有紀錄（fmCalls）
//   3. 關掉會影響測試的東西：背景記憶提取、自動開瀏覽器；天氣 API 指到一個不存在的位址
//
// 必須在 import 任何 server/ 的檔案之前呼叫：config.js 是在載入時讀環境變數的。

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { toLocalIso } from '../../server/lib/time.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function setupTestEnv({ extraEnv = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'pokkatomo-test-'));
  // 資料夾不用先建：程式第一次寫檔時會自己建（見 server/lib/jsonStore.js）
  const dataDir = path.join(root, 'data');
  const fmBin = path.join(root, 'fm-bin');
  const behaviorPath = path.join(root, 'fm-behavior.json');
  const callsPath = path.join(root, 'fm-calls.jsonl');

  const fakeFmSource = readFileSync(path.join(HERE, 'fakeFm.cjs'), 'utf-8')
    .replace('__BEHAVIOR_PATH__', JSON.stringify(behaviorPath))
    .replace('__CALLS_PATH__', JSON.stringify(callsPath));
  writeFileSync(fmBin, `#!${process.execPath}\n${fakeFmSource}`);
  chmodSync(fmBin, 0o755);
  writeFileSync(behaviorPath, JSON.stringify({}));

  Object.assign(process.env, {
    POKKATOMO_DATA_DIR: dataDir,
    FM_BIN: fmBin,
    FM_TIMEOUT_MS: '4000',
    DISABLE_FACT_EXTRACTION: '1',
    POKKATOMO_OPEN_BROWSER: '0',
    WEATHER_API_BASE: 'http://127.0.0.1:9',
    GEOCODE_API_BASE: 'http://127.0.0.1:9',
    ...extraEnv
  });

  return {
    root,
    dataDir,
    /** 改變假 fm 的行為，例如 setFm({ reply: '[mood:sad] 嗯…' }) 或 setFm({ fail: 'boom' }) */
    setFm(behavior) {
      writeFileSync(behaviorPath, JSON.stringify(behavior));
    },
    /** 到目前為止所有 fm 呼叫：[{ kind, args, instructions, message }] */
    fmCalls() {
      if (!existsSync(callsPath)) return [];
      return readFileSync(callsPath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    },
    clearFmCalls() {
      writeFileSync(callsPath, '');
    },
    dataFile(name) {
      return path.join(dataDir, name);
    },
    readData(name) {
      const p = path.join(dataDir, name);
      return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : undefined;
    },
    writeData(name, value) {
      mkdirSync(path.dirname(path.join(dataDir, name)), { recursive: true });
      writeFileSync(path.join(dataDir, name), JSON.stringify(value));
    },
    /** 某個角色資料夾裡的檔案路徑（預設第一個角色 001），例如 charFile('state.json') */
    charFile(name, id = '001') {
      return path.join(dataDir, 'characters', id, name);
    },
    readChar(name, id = '001') {
      const p = path.join(dataDir, 'characters', id, name);
      return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : undefined;
    },
    writeChar(name, value, id = '001') {
      const p = path.join(dataDir, 'characters', id, name);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value));
    },
    /** 直接寫入角色的對話檔（conversations/YYYY-MM.jsonl），給「已經聊過天」的測試情境用。會覆蓋那個角色原本的對話。 */
    writeHistory(messages, id = '001') {
      const dir = path.join(dataDir, 'characters', id, 'conversations');
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const byMonth = {};
      messages.forEach((m, i) => {
        const d = new Date(m.ts);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const { ts, ...rest } = m;
        (byMonth[month] ||= []).push(JSON.stringify({ id: `t${i}`, time: toLocalIso(ts), ...rest }));
      });
      for (const [month, lines] of Object.entries(byMonth)) writeFileSync(path.join(dir, `${month}.jsonl`), `${lines.join('\n')}\n`);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    }
  };
}
