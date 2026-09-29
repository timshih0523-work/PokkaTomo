// lanTls.js — 「手機／平板連線」用的 HTTPS 憑證（自己發、只在家裡用）。
//
// 為什麼要：瀏覽器規定麥克風只能在安全連線（HTTPS）使用。手機用 HTTP 連進來就不能「按住說話」。
// 做法（跟 mkcert 一樣的原理，但不用另外裝工具）：
//   1. 第一次打開手機連線時，在這台 Mac 上產生一張「PokkaTomo 家用憑證」（CA，10 年）。
//   2. 用它簽一張給伺服器用的憑證（名字＝<電腦名稱>.local＋這台電腦現在的區網 IP）。
//   3. iPhone／iPad 各安裝一次 CA（設定頁 lanSetupApp.js 提供下載與步驟），之後 https:// 就不會有警告，麥克風也能用。
// 伺服器憑證的有效期 397 天（Apple 的上限），剩不到 30 天、或電腦的 IP／名稱變了，就用同一張 CA 重簽——
// 手機不用重裝（只有 CA 換掉才要重裝）。
//
// 檔案放在 server/data/tls/（不上傳 Git、不放進匯出／備份，匯入備份時也不會搬走，見 dataAdminService.importBackup）。
// ca.key 是這台電腦自己的私鑰，不要給別人。

import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import forge from 'node-forge';

import { DATA_DIR } from '../config.js';
import { assertDataHome } from './dataHome.js';
import { log } from './logger.js';

export const TLS_DIR = path.join(DATA_DIR, 'tls');
const FILES = {
  caKey: path.join(TLS_DIR, 'ca.key'),
  caCert: path.join(TLS_DIR, 'ca.crt'),
  key: path.join(TLS_DIR, 'server.key'),
  cert: path.join(TLS_DIR, 'server.crt')
};

const SERVER_DAYS = 397;
const RENEW_BEFORE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

const readOrNull = (p) => readFile(p, 'utf-8').catch(() => null);

// node 內建的 RSA 產生比 node-forge（純 JS）快很多
function newKeyPair() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const priv = forge.pki.privateKeyFromPem(pem);
  return { pem, privateKey: priv, publicKey: forge.pki.setRsaPublicKey(priv.n, priv.e) };
}

function randomSerial() {
  // 正數、16 bytes
  const b = crypto.randomBytes(16);
  b[0] &= 0x7f;
  return b.toString('hex');
}

/** 這台電腦在家裡網路上的名字：<電腦名稱>.local（沒有就空字串） */
export function localHostName() {
  const name = os.hostname().replace(/\.local$/i, '');
  return name ? `${name}.local` : '';
}

/** 這台電腦現在的區網 IPv4 位址 */
export function localIPv4s() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

function currentNames() {
  const dns = [localHostName(), 'localhost'].filter(Boolean);
  const ips = ['127.0.0.1', ...localIPv4s()];
  return { dns: [...new Set(dns)], ips: [...new Set(ips)] };
}

async function loadOrCreateCa() {
  const [keyPem, certPem] = await Promise.all([readOrNull(FILES.caKey), readOrNull(FILES.caCert)]);
  if (keyPem && certPem) {
    try {
      return { key: forge.pki.privateKeyFromPem(keyPem), cert: forge.pki.certificateFromPem(certPem), certPem, created: false };
    } catch (err) {
      log.warn('lan_tls_ca_unreadable', { error: err.message });
    }
  }
  const kp = newKeyPair();
  const cert = forge.pki.createCertificate();
  cert.publicKey = kp.publicKey;
  cert.serialNumber = randomSerial();
  const now = Date.now();
  cert.validity.notBefore = new Date(now - DAY);
  cert.validity.notAfter = new Date(now + 3650 * DAY);
  const host = os.hostname().replace(/\.local$/i, '') || 'Mac';
  const attrs = [
    { name: 'commonName', value: `PokkaTomo Home CA (${host})` },
    { name: 'organizationName', value: 'PokkaTomo' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' }
  ]);
  cert.sign(kp.privateKey, forge.md.sha256.create());
  const newPem = forge.pki.certificateToPem(cert);
  await mkdir(TLS_DIR, { recursive: true });
  await writeFile(FILES.caKey, kp.pem, { mode: 0o600 });
  await writeFile(FILES.caCert, newPem);
  log.info('lan_tls_ca_created', {});
  return { key: kp.privateKey, cert, certPem: newPem, created: true };
}

// 現在的伺服器憑證還能不能用：沒過期（剩超過 30 天）、名字都有涵蓋、是這張 CA 簽的
function serverCertOk(certPem, ca, names) {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    if (cert.validity.notAfter.getTime() - Date.now() < RENEW_BEFORE_DAYS * DAY) return false;
    if (!ca.cert.verify(cert)) return false;
    const san = cert.getExtension('subjectAltName')?.altNames || [];
    const dns = new Set(san.filter((a) => a.type === 2).map((a) => String(a.value).toLowerCase()));
    const ips = new Set(san.filter((a) => a.type === 7).map((a) => a.ip));
    return names.dns.every((d) => dns.has(d.toLowerCase())) && names.ips.every((ip) => ips.has(ip));
  } catch {
    return false;
  }
}

async function issueServerCert(ca, names) {
  const kp = newKeyPair();
  const cert = forge.pki.createCertificate();
  cert.publicKey = kp.publicKey;
  cert.serialNumber = randomSerial();
  const now = Date.now();
  cert.validity.notBefore = new Date(now - DAY);
  cert.validity.notAfter = new Date(now + SERVER_DAYS * DAY);
  cert.setSubject([{ name: 'commonName', value: names.dns[0] || 'PokkaTomo' }]);
  cert.setIssuer(ca.cert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [...names.dns.map((value) => ({ type: 2, value })), ...names.ips.map((ip) => ({ type: 7, ip }))] },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: ca.cert.generateSubjectKeyIdentifier().getBytes() }
  ]);
  cert.sign(ca.key, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);
  await writeFile(FILES.key, kp.pem, { mode: 0o600 });
  await writeFile(FILES.cert, certPem);
  log.info('lan_tls_server_cert_issued', { dns: names.dns, ips: names.ips });
  return { key: kp.pem, cert: certPem };
}

/**
 * 準備好 HTTPS 需要的東西（沒有就產生、名字變了或快過期就重簽）。
 * @returns {Promise<{ key: string, cert: string, caCertPem: string, renewed: boolean }>}
 *   cert 是「伺服器憑證＋CA」整串（讓手機拿到完整的鏈）
 */
export async function ensureLanTls() {
  assertDataHome();
  await mkdir(TLS_DIR, { recursive: true });
  const ca = await loadOrCreateCa();
  const names = currentNames();
  let key = await readOrNull(FILES.key);
  let cert = await readOrNull(FILES.cert);
  let renewed = false;
  if (ca.created || !key || !cert || !serverCertOk(cert, ca, names)) {
    ({ key, cert } = await issueServerCert(ca, names));
    renewed = true;
  }
  return { key, cert: cert + ca.certPem, caCertPem: ca.certPem, renewed };
}

/** CA 憑證（給手機下載安裝）。還沒產生過回傳 null。 */
export function readCaCert() {
  return readOrNull(FILES.caCert);
}

/** CA 的 SHA-256 指紋（設定頁顯示，讓人可以對照手機上看到的是不是同一張） */
export function fingerprintOf(certPem) {
  try {
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(certPem))).getBytes();
    return crypto.createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex').toUpperCase().match(/.{2}/g).join(':');
  } catch {
    return null;
  }
}
