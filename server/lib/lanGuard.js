// lanGuard.js
// 「手機／平板連線」（lanService.js）那個 port 的安全檢查。只在使用者自己打開這個功能時才會有這個 port。
//   1. 連線來源一定要是區網（家裡 Wi‑Fi）的位址：10.x、172.16–31.x、192.168.x、169.254.x、IPv6 的 fe80::／fc00::。
//   2. Host 標頭一定要是「區網 IP」或「<電腦名稱>.local」：擋 DNS rebinding（惡意網站把自己的網域指到這台電腦）。
//   3. 功能關掉之後（伺服器還沒完全關好前）進來的請求也擋掉。
// 其他保護跟本機一樣：要輸入四位數密碼（lib/lockGuard.js）。
// 注意：這條線是 HTTP，家裡 Wi‑Fi 上傳的東西沒有加密（密碼、對話）；所以只給家裡用，不對外。

import os from 'os';

import { isLanEnabled } from '../lanService.js';

export function isPrivateAddress(addr) {
  let a = String(addr || '').toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1' || a.startsWith('127.')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (m) {
    const [x, y] = [Number(m[1]), Number(m[2])];
    return x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254);
  }
  return a.startsWith('fe80:') || a.startsWith('fc') || a.startsWith('fd');
}

function hostnameOf(hostHeader) {
  const h = String(hostHeader || '');
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']')).toLowerCase();
  return h.split(':')[0].toLowerCase();
}

export function isAllowedLanHost(hostHeader, machineName = os.hostname()) {
  const host = hostnameOf(hostHeader);
  if (!host) return false;
  if (isPrivateAddress(host)) return true;
  const me = String(machineName || '').toLowerCase().replace(/\.local$/, '');
  return host.endsWith('.local') && (!me || host === `${me}.local`);
}

export function lanGuard(req, res, next) {
  if (!isLanEnabled()) return res.status(403).json({ error: 'lan_disabled', message: '手機／平板連線已關閉' });
  if (!isPrivateAddress(req.socket?.remoteAddress)) {
    return res.status(403).json({ error: 'forbidden', message: '只接受家裡網路的連線' });
  }
  if (!isAllowedLanHost(req.headers.host)) return res.status(403).json({ error: 'forbidden', message: '連線位址不對' });
  req.fromLan = true;
  next();
}
