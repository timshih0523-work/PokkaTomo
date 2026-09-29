// speechService.js — 在 Mac 上把手機錄的音轉成文字（手機／平板的「按住說話」用）。
//
// 為什麼不用手機瀏覽器自己的語音辨識：iPhone／iPad 上的 Chrome 底層是 Safari 的引擎，瀏覽器的語音辨識很不穩定；
// 但「錄音」在 HTTPS 下是都能用的。所以手機只負責錄音（前端做成 16kHz 單聲道 WAV），傳到 Mac 用 macOS 內建的
// Speech 框架辨識（server/native/speech.swift；盡量在這台電腦上辨識，不用上網）。
//
// 流程：
//   1. prepareSpeech()：手機連線打開時（lanService）在背景做。第一次（或 speech.swift 改過）用 Xcode 指令列工具的
//      swiftc 編成 server/native/build/PokkaTomoSpeech.app（不上傳 Git），然後問一次「是否允許語音辨識」
//      （Mac 畫面上會跳出系統詢問，要按「好」）。
//   2. transcribe(wav, locale)：一次處理一個（排隊），用 `open` 叫起那個小 App，結果從 --stdout 的暫存檔讀回來。
//      用 .app＋open 的原因見 speech.swift 開頭。
//
// 不是 macOS（開發用的 Linux、測試）：狀態是 unsupported。測試可以用 POKKATOMO_SPEECH_BIN 指定假的辨識程式
// （直接執行、參數跟真的一樣：<音檔> <語言> 或 --authorize，stdout 一行 JSON）。

import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readFile, writeFile, rm, rename, access } from 'fs/promises';

import { enqueue } from './lib/asyncQueue.js';
import { log } from './lib/logger.js';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const NATIVE_DIR = path.join(HERE, 'native');
const SOURCE = path.join(NATIVE_DIR, 'speech.swift');
const BUILD_DIR = path.join(NATIVE_DIR, 'build');
const APP_NAME = 'PokkaTomoSpeech';
const APP_PATH = path.join(BUILD_DIR, `${APP_NAME}.app`);
const BIN_PATH = path.join(APP_PATH, 'Contents', 'MacOS', APP_NAME);
const HASH_PATH = path.join(BUILD_DIR, '.source-hash');

const FAKE_BIN = process.env.POKKATOMO_SPEECH_BIN || '';
const RUN_TIMEOUT_MS = 60000;
const AUTH_TIMEOUT_MS = 150000;

// 語音辨識用的語言（角色說話的語言）
export const SPEECH_LOCALES = { zh: 'zh-TW', ja: 'ja-JP' };

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>app.pokkatomo.speech</string>
  <key>CFBundleName</key><string>PokkaTomo Speech</string>
  <key>CFBundleDisplayName</key><string>PokkaTomo 語音辨識</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>PokkaTomo 會把手機／平板錄的話轉成文字，讓角色聽懂你說什麼。 / スマホで話した言葉を文字にして、キャラに伝えるために使います。</string>
</dict>
</plist>
`;

// state：unsupported（不是 Mac）| idle（還沒準備）| no_compiler（沒有 Xcode 指令列工具）| building | build_failed | ready
// auth：unknown | authorized | denied | restricted | notDetermined
const status = { state: process.platform === 'darwin' || FAKE_BIN ? 'idle' : 'unsupported', auth: 'unknown', error: null };
let preparing = null;

export function getSpeechStatus() {
  return { ...status, available: status.state === 'ready' && status.auth === 'authorized' };
}

export function speechAvailable() {
  return status.state === 'ready' && status.auth === 'authorized';
}

const exists = (p) =>
  access(p).then(
    () => true,
    () => false
  );

async function sourceHash() {
  const src = await readFile(SOURCE, 'utf-8');
  return crypto.createHash('sha256').update(src).update(INFO_PLIST).digest('hex');
}

// 編譯 speech.swift → PokkaTomoSpeech.app（原始碼沒變就不重編：重編後 macOS 會當成新的 App，要重新允許）
async function build() {
  const hash = await sourceHash();
  if ((await exists(BIN_PATH)) && (await readFile(HASH_PATH, 'utf-8').catch(() => '')) === hash) return;

  try {
    await execFileAsync('/usr/bin/xcrun', ['--find', 'swiftc'], { timeout: 30000 });
  } catch {
    const err = new Error('找不到 swiftc（需要 Xcode 指令列工具）');
    err.code = 'no_compiler';
    throw err;
  }

  status.state = 'building';
  log.info('speech_build_start', {});
  const tmpApp = path.join(BUILD_DIR, `${APP_NAME}.tmp-${process.pid}.app`);
  const macosDir = path.join(tmpApp, 'Contents', 'MacOS');
  await rm(tmpApp, { recursive: true, force: true });
  await mkdir(macosDir, { recursive: true });
  await writeFile(path.join(tmpApp, 'Contents', 'Info.plist'), INFO_PLIST);
  try {
    await execFileAsync(
      '/usr/bin/xcrun',
      ['swiftc', '-O', '-swift-version', '5', '-framework', 'Speech', SOURCE, '-o', path.join(macosDir, APP_NAME)],
      { timeout: 300000, maxBuffer: 4 * 1024 * 1024 }
    );
    // 本機簽章（ad-hoc）：macOS 記得「允許語音辨識」要靠簽章認得同一個 App
    await execFileAsync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', tmpApp], { timeout: 60000 });
  } catch (err) {
    await rm(tmpApp, { recursive: true, force: true });
    const e = new Error(String(err.stderr || err.message).slice(0, 1500));
    e.code = 'build_failed';
    throw e;
  }
  await rm(APP_PATH, { recursive: true, force: true });
  await rename(tmpApp, APP_PATH);
  await writeFile(HASH_PATH, hash);
  log.info('speech_build_done', {});
}

// 執行辨識小幫手，回傳它輸出的 JSON
async function runHelper(args, timeout) {
  if (FAKE_BIN) {
    const { stdout } = await execFileAsync(FAKE_BIN, args, { timeout });
    return parseLastJson(stdout);
  }
  const tag = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const outFile = path.join(os.tmpdir(), `pokkatomo-speech-${tag}.out`);
  const errFile = path.join(os.tmpdir(), `pokkatomo-speech-${tag}.err`);
  try {
    // -W 等它結束、-n 每次開新的、-g 不要搶到前景
    await execFileAsync('/usr/bin/open', ['-W', '-n', '-g', '--stdout', outFile, '--stderr', errFile, '-a', APP_PATH, '--args', ...args], { timeout });
    const out = await readFile(outFile, 'utf-8').catch(() => '');
    const parsed = parseLastJson(out);
    if (!parsed) {
      const errText = await readFile(errFile, 'utf-8').catch(() => '');
      throw new Error(`辨識程式沒有回應：${errText.slice(0, 300)}`);
    }
    return parsed;
  } finally {
    await rm(outFile, { force: true });
    await rm(errFile, { force: true });
  }
}

function parseLastJson(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      /* 下一行 */
    }
  }
  return null;
}

/**
 * 準備語音辨識：編譯（需要時）＋要求權限。手機連線打開時在背景呼叫；重複呼叫會共用同一次。
 * @param {{ force?: boolean }} [opts] force：之前失敗／被拒絕也重新試（設定面板的「重新檢查」）
 */
export function prepareSpeech({ force = false } = {}) {
  if (status.state === 'unsupported') return Promise.resolve(getSpeechStatus());
  if (preparing) return preparing;
  if (!force && status.state === 'ready' && status.auth === 'authorized') return Promise.resolve(getSpeechStatus());
  preparing = (async () => {
    try {
      if (!FAKE_BIN) await build();
      status.state = 'ready';
      status.error = null;
      const r = await runHelper(['--authorize'], AUTH_TIMEOUT_MS);
      status.auth = r?.status || 'unknown';
      log.info('speech_ready', { auth: status.auth });
    } catch (err) {
      status.state = err.code === 'no_compiler' ? 'no_compiler' : status.state === 'ready' ? 'ready' : 'build_failed';
      status.error = err.message.slice(0, 500);
      log.error('speech_prepare_failed', { code: err.code, error: err.message.slice(0, 500) });
    } finally {
      preparing = null;
    }
    return getSpeechStatus();
  })();
  return preparing;
}

/**
 * 把一段錄音（WAV）轉成文字。一次只處理一個。
 * @returns {Promise<{ text: string, onDevice?: boolean }>}
 */
export function transcribe(wav, locale) {
  return enqueue('speech-recognition', async () => {
    const file = path.join(os.tmpdir(), `pokkatomo-rec-${process.pid}-${crypto.randomBytes(4).toString('hex')}.wav`);
    await writeFile(file, wav);
    try {
      const r = await runHelper([file, locale], RUN_TIMEOUT_MS);
      if (r?.error) {
        if (r.error === 'not_authorized') status.auth = r.status || 'denied';
        const err = new Error(r.message || r.error);
        err.code = r.error;
        throw err;
      }
      return { text: typeof r?.text === 'string' ? r.text.trim() : '', onDevice: r?.onDevice };
    } finally {
      await rm(file, { force: true });
    }
  });
}

/** 看起來像不像 WAV（RIFF....WAVE），避免把奇怪的東西交給辨識程式 */
export function looksLikeWav(buf) {
  return Buffer.isBuffer(buf) && buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE';
}
