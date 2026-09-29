// localOnly.js
// 只接受「從這台電腦自己的瀏覽器」來的請求。
//
// 伺服器已經只聽 127.0.0.1（見 config.js 的 HOST），同一個 Wi-Fi 的其他人連不進來。
// 這裡再擋一種比較隱密的情況：DNS rebinding——她在瀏覽器開了某個惡意網站，那個網站把自己的網域
// 暫時指到 127.0.0.1，就能用「看起來是同一個網站」的身分讀 http://localhost:3000/api/… 的聊天紀錄、日記。
// 這種請求的 Host 標頭會是那個網站的網域，不是 localhost，檢查 Host 就能擋掉。
//
// 如果之後改成 HOST=0.0.0.0 讓手機連進來，這個檢查會自動關掉（那時候要另外加密碼保護）。

import { HOST } from '../config.js';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function localOnly(req, res, next) {
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') return next();
  const hostHeader = String(req.headers.host || '');
  const hostname = hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0];
  if (LOCAL_HOSTNAMES.has(hostname.toLowerCase())) return next();
  res.status(403).json({ error: 'forbidden', message: '只接受從這台電腦開啟的連線' });
}
