// lanService.js — 「手機／平板連線」：讓同一個 Wi‑Fi 的 iPhone／iPad 用瀏覽器打開 PokkaTomo。
//
// 平常伺服器只聽 127.0.0.1（這台電腦自己）。使用者在設定裡打開這個功能時，另外開兩個聽 0.0.0.0 的伺服器，關掉就停掉：
//   - LAN_PORT（預設 3001）：HTTPS，同一個 Express app 的另一份（資料、密碼、登入狀態都共用）。
//     憑證是這台電腦自己發的（lib/lanTls.js）；HTTPS 才能用麥克風，手機錄的音交給 Mac 辨識（speechService.js）。
//   - LAN_SETUP_PORT（預設 3002）：HTTP 的「第一次設定」頁（lanSetupApp.js）：每台手機安裝一次憑證。
// 開關記在 server/data/app/settings.json，下次啟動會照著開。安全檢查見 lib/lanGuard.js。
//
// 限制（要讓使用者知道）：
//   - Mac 睡著或 PokkaTomo 沒開的時候連不到。
//   - 第一次打開時 macOS 可能會問「是否允許 node 接受連入的連線」，要按允許。

import http from 'http';
import https from 'https';
import path from 'path';

import { LAN_PORT, LAN_SETUP_PORT } from './config.js';
import { APP_DIR } from './lib/characterContext.js';
import { readJson, writeJsonAtomic } from './lib/jsonStore.js';
import { enqueue } from './lib/asyncQueue.js';
import { log } from './lib/logger.js';
import { ensureLanTls, localHostName, localIPv4s, readCaCert, fingerprintOf } from './lib/lanTls.js';
import { createLanSetupApp } from './lanSetupApp.js';
import { prepareSpeech } from './speechService.js';

const SETTINGS_PATH = path.join(APP_DIR, 'settings.json');

let enabled = false; // 記憶體裡的開關（lanGuard 每個請求都看）
let server = null;
let lastError = null;
let appFactory = null;

export const isLanEnabled = () => enabled;

/** server.js 啟動時給：產生「手機連線用」的 Express app 的函式（避免 routes ↔ app 互相 import）。 */
export function setLanAppFactory(fn) {
  appFactory = fn;
}

async function readSettings() {
  const s = await readJson(SETTINGS_PATH, () => ({}));
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
}

let setupServer = null;
let renewTimer = null;
let caFingerprint = null;

function listenOn(srv, port, label) {
  return new Promise((resolve) => {
    srv.once('error', (err) => {
      const code = err.code === 'EADDRINUSE' ? 'port_in_use' : err.code || err.message;
      log.error('lan_listen_failed', { port, which: label, error: code });
      resolve({ ok: false, code });
    });
    srv.listen(port, '0.0.0.0', () => resolve({ ok: true }));
  });
}

// 電腦的 IP／名稱變了、或憑證快到期：重簽後直接換上（不用重開伺服器，手機也不用重裝）
async function refreshTls() {
  if (!server) return;
  try {
    const tls = await ensureLanTls();
    if (tls.renewed && server) {
      server.setSecureContext({ key: tls.key, cert: tls.cert });
      log.info('lan_tls_reloaded', {});
    }
  } catch (err) {
    log.warn('lan_tls_refresh_failed', { error: err.message });
  }
}

async function listen() {
  if (server || !appFactory) return;
  let tls;
  try {
    tls = await ensureLanTls();
  } catch (err) {
    lastError = 'tls_failed';
    log.error('lan_tls_failed', { error: err.message });
    return;
  }
  caFingerprint = fingerprintOf(tls.caCertPem);
  const s = https.createServer({ key: tls.key, cert: tls.cert }, appFactory());
  const r = await listenOn(s, LAN_PORT, 'https');
  if (!r.ok) {
    lastError = r.code;
    return;
  }
  server = s;
  lastError = null;
  const setup = http.createServer(createLanSetupApp());
  const r2 = await listenOn(setup, LAN_SETUP_PORT, 'setup');
  setupServer = r2.ok ? setup : null;
  if (!r2.ok) lastError = r2.code === 'port_in_use' ? 'setup_port_in_use' : r2.code;
  // Wi‑Fi 換了 IP 也要跟著重簽：每 10 分鐘看一次（沒變就什麼都不做）
  renewTimer = setInterval(refreshTls, 10 * 60 * 1000);
  renewTimer.unref?.();
  // 手機上的「按住說話」要用 Mac 的語音辨識：在背景先準備好（第一次會編譯、Mac 上會跳出「允許語音辨識」）
  prepareSpeech().catch(() => {});
  log.info('lan_started', { port: LAN_PORT, setupPort: LAN_SETUP_PORT });
}

function closeOne(srv) {
  if (!srv) return Promise.resolve();
  return new Promise((resolve) => {
    srv.close(() => resolve());
    srv.closeAllConnections?.();
  });
}

async function close() {
  if (renewTimer) clearInterval(renewTimer);
  renewTimer = null;
  const had = !!server || !!setupServer;
  const [a, b] = [server, setupServer];
  server = null;
  setupServer = null;
  await Promise.all([closeOne(a), closeOne(b)]);
  if (had) log.info('lan_stopped', {});
}

/** 伺服器啟動時：上次有打開就照開。 */
export async function startLanIfEnabled() {
  const s = await readSettings();
  enabled = s.lanEnabled === true;
  if (enabled) await listen();
}

/** 打開／關掉（設定面板）。 */
export function setLanEnabled(on) {
  return enqueue(SETTINGS_PATH, async () => {
    const s = await readSettings();
    await writeJsonAtomic(SETTINGS_PATH, { ...s, lanEnabled: !!on });
    enabled = !!on;
    if (enabled) await listen();
    else await close();
    return getLanInfo();
  });
}

export function stopLan() {
  enabled = false;
  return close();
}

function hostsForUrls() {
  const hosts = [];
  const name = localHostName();
  if (name) hosts.push(name);
  hosts.push(...localIPv4s());
  return hosts;
}

/** 手機要打開的網址（HTTPS；第一個＝<電腦名稱>.local，IP 換了也不用重新掃） */
export function lanUrls() {
  return hostsForUrls().map((h) => `https://${h}:${LAN_PORT}/`);
}

/** 每台手機第一次要打開的設定頁（HTTP：這時手機還不認得我們的憑證） */
export function lanSetupUrls() {
  return hostsForUrls().map((h) => `http://${h}:${LAN_SETUP_PORT}/`);
}

export function getLanInfo() {
  return {
    enabled,
    running: !!server,
    port: LAN_PORT,
    setupPort: LAN_SETUP_PORT,
    setupRunning: !!setupServer,
    urls: lanUrls(),
    setupUrls: lanSetupUrls(),
    caFingerprint,
    error: lastError
  };
}

export { readCaCert };
