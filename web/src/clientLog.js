// clientLog.js
// 把前端發生的錯誤送到後端的紀錄檔（POST /api/log → server/data/logs/）。
// 使用者不會打開瀏覽器的開發者工具，以前前端出錯就完全沒有痕跡。
// 只送事件名稱跟簡短說明，不送對話內容。送不出去就算了，絕對不能因為回報錯誤又造成錯誤。

const recent = new Map(); // 同一個錯誤 30 秒內只送一次

export function reportClient(event, detail = '', level = 'error') {
  try {
    const key = `${event}:${detail}`;
    const now = Date.now();
    if (now - (recent.get(key) || 0) < 30000) return;
    recent.set(key, now);
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, level, detail: String(detail).slice(0, 300) }),
      keepalive: true
    }).catch(() => {});
  } catch {
    /* 忽略 */
  }
}

/** 接上全域錯誤：沒被接住的例外、Promise 失敗、Vue 元件錯誤。 */
export function installClientErrorReporting(app) {
  window.addEventListener('error', (e) => reportClient('window_error', `${e.message} @${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => reportClient('unhandled_rejection', e.reason?.message || String(e.reason)));
  if (app) {
    app.config.errorHandler = (err, _instance, info) => {
      reportClient('vue_error', `${err?.message || err} (${info})`);
      console.error(err);
    };
  }
}
