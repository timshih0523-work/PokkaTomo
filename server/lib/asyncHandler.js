// asyncHandler.js
// 這個專案用的是 Express 4：一個 async route handler 裡如果丟出例外或 Promise reject，
// Express 4 不會自動接住，也不會呼叫錯誤處理 middleware——請求會直接沒有任何回應，
// 前端的 fetch 會一直卡著，使用者只會看到「一直在想」但永遠不會失敗也不會成功。
//
// 這是一個真實存在過的架構缺口：只有 /api/chat 有手動包 try/catch，
// /api/profile、/api/history 都沒有——如果哪天硬碟出問題、檔案權限跑掉，
// 這幾個路由會整個掛住沒有回應，跟這個專案花很多力氣做的「AI 沒反應時的體驗」精神互相矛盾。
//
// 用法：把 route handler 包一層 asyncHandler(...)，任何錯誤都會被轉呼叫 next(err)，
// 交給 server.js 裡的集中錯誤處理 middleware 統一回應，保證一定有回應。
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
