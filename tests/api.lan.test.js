// 手機／平板連線（lanService.js、lib/lanGuard.js）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import https from 'https';
import tls from 'tls';
import { readFileSync, existsSync } from 'fs';
import { setupTestEnv } from './helpers/env.js';

const LAN_PORT = 30000 + (process.pid % 20000);
const SETUP_PORT = LAN_PORT + 1;
const env = setupTestEnv({ extraEnv: { POKKATOMO_LAN_PORT: String(LAN_PORT), POKKATOMO_LAN_SETUP_PORT: String(SETUP_PORT) } });
const { createApp } = await import('../server/app.js');
const lan = await import('../server/lanService.js');
const { isPrivateAddress, isAllowedLanHost } = await import('../server/lib/lanGuard.js');

let server;
let base;
let token;
before(async () => {
  lan.setLanAppFactory(() => createApp({ lan: true }));
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await lan.stopLan();
  server.close();
  env.cleanup();
});

const call = (p, { body, method } = {}) =>
  fetch(base + p, {
    method: method || (body ? 'PUT' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-PokkaTomo-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });

// 模擬手機打過來（fetch 會忽略自訂的 Host，所以用 https.request）。
// 手機裝了 CA 之後會信任我們的憑證：這裡也一樣，只信任 server/data/tls/ca.crt（不關掉憑證檢查）。
function lanGet(p, host, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const ca = readFileSync(env.dataFile('tls/ca.crt'), 'utf-8');
    const r = https.request(
      { host: '127.0.0.1', port: LAN_PORT, path: p, agent: false, ca, servername: 'localhost', headers: { Host: host, ...extraHeaders } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
      }
    );
    r.on('error', reject);
    r.end();
  });
}

// 第一次設定頁（HTTP）
function setupGet(p, host, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: SETUP_PORT, path: p, agent: false, headers: { Host: host, ...extraHeaders } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    r.end();
  });
}

test('位址判斷：家裡網路的 IP 算、外面的不算；Host 只接受區網 IP 或 <這台電腦>.local', () => {
  for (const a of ['192.168.1.5', '10.0.0.2', '172.20.1.1', '::ffff:192.168.0.9', 'fe80::1', '127.0.0.1']) assert.equal(isPrivateAddress(a), true, a);
  for (const a of ['8.8.8.8', '172.32.0.1', '203.0.113.5', '::ffff:1.1.1.1']) assert.equal(isPrivateAddress(a), false, a);
  assert.equal(isAllowedLanHost('192.168.1.5:3001', 'Macbook.local'), true);
  assert.equal(isAllowedLanHost('macbook.local:3001', 'Macbook.local'), true);
  assert.equal(isAllowedLanHost('other.local:3001', 'Macbook.local'), false);
  assert.equal(isAllowedLanHost('evil.example.com:3001', 'Macbook.local'), false);
});

test('沒設定密碼不能打開；打開後手機連得進來，但要密碼、也不能改開關；關掉就連不到', async () => {
  const noPin = await call('/api/lan', { body: { enabled: true } });
  assert.equal(noPin.status, 400);
  token = (await (await fetch(`${base}/api/lock/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '2580' }) })).json()).token;

  const on = await (await call('/api/lan', { body: { enabled: true } })).json();
  assert.equal(on.enabled, true);
  assert.equal(on.running, true);
  assert.equal(on.port, LAN_PORT);
  assert.ok(on.urls.every((u) => u.startsWith('https://') && u.endsWith(`:${LAN_PORT}/`)));
  assert.ok(on.setupUrls.every((u) => u.startsWith('http://') && u.endsWith(`:${SETUP_PORT}/`)));
  assert.match(on.caFingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.ok(existsSync(env.dataFile('tls/ca.key')) && existsSync(env.dataFile('tls/server.crt')));
  assert.deepEqual(env.readData('app/settings.json'), { lanEnabled: true });

  assert.equal((await lanGet('/api/health', `192.168.1.20:${LAN_PORT}`)).status, 200);
  assert.equal((await lanGet('/api/profile', `192.168.1.20:${LAN_PORT}`)).status, 401, '一樣要密碼');
  assert.equal((await lanGet('/api/health', `evil.example.com:${LAN_PORT}`)).status, 403, 'DNS rebinding 擋掉');
  const info = await lanGet('/api/lan', `192.168.1.20:${LAN_PORT}`, { 'X-PokkaTomo-Token': token });
  assert.equal(info.body.canManage, false, '手機上不能改開關');

  // 第一次設定頁：說明＋下載憑證；其他路徑轉到 HTTPS；一樣擋 DNS rebinding
  const page = await setupGet('/', `192.168.1.20:${SETUP_PORT}`, { 'Accept-Language': 'ja-JP,ja;q=0.9' });
  assert.equal(page.status, 200);
  assert.match(page.body, /証明書信頼設定/);
  assert.match(page.body, new RegExp(`https://192\\.168\\.1\\.20:${LAN_PORT}/`));
  const zhPage = await setupGet('/', `192.168.1.20:${SETUP_PORT}`);
  assert.match(zhPage.body, /憑證信任設定/);
  const crt = await setupGet('/pokkatomo-ca.crt', `192.168.1.20:${SETUP_PORT}`);
  assert.equal(crt.headers['content-type'], 'application/x-x509-ca-cert');
  assert.equal(crt.body, readFileSync(env.dataFile('tls/ca.crt'), 'utf-8'));
  assert.ok(!crt.body.includes('PRIVATE KEY'), '只給憑證，私鑰絕對不能出去');
  const redir = await setupGet('/api/profile', `192.168.1.20:${SETUP_PORT}`);
  assert.equal(redir.status, 302);
  assert.equal(redir.headers.location, `https://192.168.1.20:${LAN_PORT}/`);
  assert.equal((await setupGet('/', `evil.example.com:${SETUP_PORT}`)).status, 403);

  const off = await (await call('/api/lan', { body: { enabled: false } })).json();
  assert.equal(off.running, false);
  await assert.rejects(lanGet('/api/health', `192.168.1.20:${LAN_PORT}`), /ECONNREFUSED/);
  await assert.rejects(setupGet('/', `192.168.1.20:${SETUP_PORT}`), /ECONNREFUSED/);
});

test('憑證：伺服器憑證是 CA 簽的、名字涵蓋這台電腦；重開不會換 CA（手機不用重裝）', async () => {
  const { ensureLanTls } = await import('../server/lib/lanTls.js');
  const caBefore = readFileSync(env.dataFile('tls/ca.crt'), 'utf-8');
  const again = await ensureLanTls();
  assert.equal(again.renewed, false, '名字沒變、還沒過期 → 不重簽');
  assert.equal(again.caCertPem, caBefore);
  const x = new (await import('crypto')).X509Certificate(readFileSync(env.dataFile('tls/server.crt')));
  const ca = new (await import('crypto')).X509Certificate(caBefore);
  assert.ok(x.verify(ca.publicKey), '是 CA 簽的');
  assert.equal(ca.ca, true);
  assert.match(x.subjectAltName, /DNS:localhost/);
  assert.match(x.subjectAltName, /IP Address:127\.0\.0\.1/);
  const days = (new Date(x.validTo) - Date.now()) / 86400000;
  assert.ok(days > 390 && days <= 398, `伺服器憑證 ${days} 天（Apple 上限 398）`);
  // 伺服器憑證被刪掉（或 IP 變了）→ 用同一張 CA 重簽
  const { rmSync } = await import('fs');
  rmSync(env.dataFile('tls/server.crt'));
  const re = await ensureLanTls();
  assert.equal(re.renewed, true);
  assert.equal(re.caCertPem, caBefore);
  assert.ok(tls.createSecureContext({ key: re.key, cert: re.cert }));
});
