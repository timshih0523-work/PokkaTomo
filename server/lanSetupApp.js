// lanSetupApp.js — 手機／平板「第一次設定」頁（HTTP，LAN_SETUP_PORT，預設 3002）。
//
// 手機要用 HTTPS 連線（才能用麥克風），但我們的憑證是自己發的（lib/lanTls.js），每台 iPhone／iPad 要先安裝一次。
// 這個頁面只做三件事：說明步驟、下載憑證（/pokkatomo-ca.crt）、裝好之後帶到 https:// 的網址。
// 不碰任何資料（沒有 /api），其他路徑一律轉到 HTTPS。安全檢查跟手機連線一樣（lib/lanGuard.js）。

import express from 'express';

import { LAN_PORT } from './config.js';
import { lanGuard } from './lib/lanGuard.js';
import { readCaCert, fingerprintOf } from './lib/lanTls.js';

const TEXT = {
  zh: {
    title: 'PokkaTomo 手機設定',
    intro: '每台 iPhone／iPad 只要做一次。做完之後，手機上也可以「按住說話」。',
    safari: '這一步請用 Safari 打開（Chrome 沒辦法安裝憑證）。裝好之後，要用 Chrome 還是 Safari 都可以。',
    s1: '按下面的「下載憑證」，跳出詢問時按「允許」，看到「已下載描述檔」就可以關掉。',
    download: '下載憑證',
    s2: '打開「設定」App：最上面會有「已下載描述檔」（沒看到的話在「一般 → VPN 與裝置管理」）→ 點進去 → 右上角「安裝」→ 輸入手機密碼 → 再按「安裝」。',
    s3: '回到「設定 → 一般 → 關於本機」，拉到最下面點「憑證信任設定」，把「PokkaTomo Home CA」的開關打開 → 按「繼續」。',
    s4: '完成！按下面的按鈕開始使用（可以把那一頁加入主畫面，之後直接點圖示就好）。',
    open: '開始使用 PokkaTomo',
    checking: '檢查中…',
    ok: '✅ 這台手機已經設定好了',
    notYet: '⚠️ 這台手機還沒設定好（或還沒打開「憑證信任設定」的開關）',
    fp: '憑證指紋（想確認是不是同一張時對照用）',
    noCa: '電腦上還沒有準備好憑證，請在電腦的設定裡重新打開「手機／平板連線」。',
    other: '日本語'
  },
  ja: {
    title: 'PokkaTomo スマホ設定',
    intro: 'iPhone／iPad ごとに一回だけやればOK。終わったら、スマホでも「おしながら話す」が使えるようになるよ。',
    safari: 'この手順は Safari で開いてね（Chrome では証明書をインストールできないよ）。終わったら Chrome でも Safari でも使えるよ。',
    s1: '下の「証明書をダウンロード」を押して、確認が出たら「許可」。「プロファイルがダウンロードされました」と出たら閉じてOK。',
    download: '証明書をダウンロード',
    s2: '「設定」アプリを開く：いちばん上に「ダウンロード済みのプロファイル」が出るよ（なければ「一般 → VPNとデバイス管理」）→ タップ → 右上の「インストール」→ iPhone のパスコード → もう一度「インストール」。',
    s3: '「設定 → 一般 → 情報」のいちばん下「証明書信頼設定」で、「PokkaTomo Home CA」のスイッチをオン →「続ける」。',
    s4: 'おしまい！下のボタンで始めよう（そのページをホーム画面に追加すると、次からはアイコンを押すだけ）。',
    open: 'PokkaTomo を開く',
    checking: '確認中…',
    ok: '✅ このスマホは設定できてるよ',
    notYet: '⚠️ このスマホはまだ設定できてないみたい（「証明書信頼設定」のスイッチもオンにしてね）',
    fp: '証明書の指紋（同じ証明書か確かめたいとき用）',
    noCa: 'パソコンで証明書の準備ができてないよ。パソコンの設定で「スマホ／タブレット接続」をもう一度オンにしてね。',
    other: '中文'
  }
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function pickLang(req) {
  if (req.query.lang === 'ja' || req.query.lang === 'zh') return req.query.lang;
  return /^ja\b/i.test(String(req.headers['accept-language'] || '')) ? 'ja' : 'zh';
}

function hostOnly(req) {
  const h = String(req.headers.host || '');
  return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
}

export function pageHtml({ lang, httpsUrl, fingerprint, hasCa }) {
  const t = TEXT[lang];
  const other = lang === 'ja' ? 'zh' : 'ja';
  return `<!doctype html>
<html lang="${lang === 'ja' ? 'ja' : 'zh-Hant'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<style>
  body { margin: 0; font-family: -apple-system, "Hiragino Sans", "PingFang TC", sans-serif; background: #fff7ee; color: #4a3a2c; line-height: 1.6; }
  main { max-width: 560px; margin: 0 auto; padding: 20px 16px 40px; }
  h1 { font-size: 22px; margin: 8px 0 4px; }
  .lang { float: right; font-size: 14px; color: #8a6d52; }
  .note { background: #ffe9d2; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
  ol { padding-left: 22px; }
  li { margin: 14px 0; }
  .btn { display: inline-block; margin-top: 8px; padding: 10px 18px; border-radius: 999px; background: #ff8a5c; color: #fff; text-decoration: none; font-weight: 700; }
  .btn.secondary { background: #fff; color: #c2572a; border: 2px solid #ff8a5c; }
  #status { font-weight: 700; margin: 12px 0; }
  .fp { font-size: 11px; color: #8a6d52; word-break: break-all; margin-top: 24px; }
</style>
</head>
<body>
<main>
  <a class="lang" href="?lang=${other}">${esc(t.other)}</a>
  <h1>🐾 ${esc(t.title)}</h1>
  <p>${esc(t.intro)}</p>
  <p id="status">${esc(t.checking)}</p>
  ${hasCa ? '' : `<p class="note">${esc(t.noCa)}</p>`}
  <p class="note">${esc(t.safari)}</p>
  <ol>
    <li>${esc(t.s1)}<br><a class="btn secondary" href="/pokkatomo-ca.crt">${esc(t.download)}</a></li>
    <li>${esc(t.s2)}</li>
    <li>${esc(t.s3)}</li>
    <li>${esc(t.s4)}<br><a class="btn" href="${esc(httpsUrl)}">${esc(t.open)}</a></li>
  </ol>
  ${fingerprint ? `<p class="fp">${esc(t.fp)}：<br>${esc(fingerprint)}</p>` : ''}
</main>
<script>
  // 憑證裝好＋信任之後，連 HTTPS 那個 port 就不會失敗（沒裝好時瀏覽器會直接拒絕連線）
  (function () {
    var el = document.getElementById('status');
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; el.textContent = ${JSON.stringify(t.notYet)}; } }, 6000);
    fetch(${JSON.stringify(`${httpsUrl}api/health`)}, { mode: 'no-cors', cache: 'no-store' })
      .then(function () { if (!done) { done = true; clearTimeout(timer); el.textContent = ${JSON.stringify(t.ok)}; } })
      .catch(function () { if (!done) { done = true; clearTimeout(timer); el.textContent = ${JSON.stringify(t.notYet)}; } });
  })();
</script>
</body>
</html>`;
}

export function createLanSetupApp() {
  const app = express();
  app.use(lanGuard);
  const httpsUrlOf = (req) => `https://${hostOnly(req)}:${LAN_PORT}/`;

  app.get('/', async (req, res) => {
    const ca = await readCaCert();
    res.set('Cache-Control', 'no-store');
    res.type('html').send(pageHtml({ lang: pickLang(req), httpsUrl: httpsUrlOf(req), fingerprint: ca ? fingerprintOf(ca) : null, hasCa: !!ca }));
  });

  // iOS Safari 看到這個 Content-Type 會當成「描述檔」下載
  app.get('/pokkatomo-ca.crt', async (_req, res) => {
    const ca = await readCaCert();
    if (!ca) return res.status(404).type('text').send('not ready');
    res.set('Content-Type', 'application/x-x509-ca-cert');
    res.set('Content-Disposition', 'attachment; filename="PokkaTomo-Home-CA.crt"');
    res.send(Buffer.from(ca, 'utf-8')); // Buffer：不要被加上 charset，iOS 才會認成描述檔
  });

  // 其他的都轉到 HTTPS（例如不小心打了 http:// 的網址）
  app.use((req, res) => res.redirect(302, httpsUrlOf(req)));
  return app;
}
