// errorHandler.js
// 集中式的 Express 錯誤處理 middleware（4 個參數，Express 靠參數數量認出這是錯誤處理器）。
// 所有路由都透過 asyncHandler 把例外丟到這裡統一處理，好處：
//   - 每個路由不用自己重複寫「try/catch + res.status(...).json(...)」的樣板碼。
//   - 回應格式固定為 { error: <code>, message: <給使用者看的話> }，前端只需要認得
//     data.error / data.message 兩個欄位（App.vue 目前就是這樣讀的），不用每個路由各自約定。
//   - AppError 以外的意外錯誤（程式 bug、硬碟壞了）也保證會回一個 500 JSON，
//     絕對不會讓請求整個掛住沒有回應。

import { AppError } from './errors.js';
import { log } from './logger.js';

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      log.error('api_error', { code: err.code, status: err.status, path: _req.originalUrl, error: err.message });
    }
    // 密碼錯誤的剩餘次數／要等幾秒（刪除角色、匯入備份時再確認密碼會用到）
    const extra = {};
    if (err.attemptsLeft !== undefined) extra.attemptsLeft = err.attemptsLeft;
    if (err.retryAfterSec !== undefined) extra.retryAfterSec = err.retryAfterSec;
    return res.status(err.status).json({ error: err.code, message: err.message, ...extra });
  }

  // 沒被歸類過的意外錯誤：印出完整堆疊方便除錯，但回給使用者的訊息保持籠統，
  // 不要把內部路徑、堆疊細節洩漏到前端畫面上。
  log.error('unexpected_error', { path: _req.originalUrl, error: err?.message, stack: err?.stack?.split('\n').slice(0, 4).join(' | ') });
  res.status(500).json({ error: 'internal_error', message: '伺服器發生未預期的錯誤，請稍後再試一次。' });
}
