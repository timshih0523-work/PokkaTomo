// errors.js
// 統一的錯誤型別：路由或 service 丟出這裡的 class，errorHandler.js 就知道
// 該回傳哪個 HTTP status code、哪個 `code` 給前端判斷（前端目前有讀 fm_unavailable 這個 code）。
// 沒有特別包成這些型別的錯誤（例如意外的程式錯誤、硬碟壞了）一律當作 500 處理，
// 但一定會回應一個 JSON，不會讓請求整個掛住沒有回應。

export class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class BadRequestError extends AppError {
  constructor(message) {
    super(message, { status: 400, code: 'bad_request' });
  }
}

// 一個角色都沒有（全新安裝、全部刪掉）時，需要「目前角色」的 API 回這個；前端看到就打開選角色畫面
export class NoCharacterError extends AppError {
  constructor(message = '還沒有角色，請先新增一個角色') {
    super(message, { status: 409, code: 'no_character' });
  }
}

export class FmUnavailableError extends AppError {
  constructor(message) {
    super(message, { status: 503, code: 'fm_unavailable' });
  }
}

export class FmRespondError extends AppError {
  constructor(message) {
    super(message, { status: 500, code: 'fm_error' });
  }
}
