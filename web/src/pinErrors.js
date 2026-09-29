// pinErrors.js — 再確認密碼（刪除角色、匯入備份）失敗時，伺服器的錯誤 → 給她看的話
// lock 是 i18n 字典的 t.lock（wrong(n)、tooMany(sec)、error）
export function pinErrorMessage(data, lock, fallback) {
  if (data?.error === 'wrong_pin') return lock.wrong(data.attemptsLeft ?? 0);
  if (data?.error === 'too_many_attempts') return lock.tooMany(data.retryAfterSec ?? 60);
  return fallback || data?.message || lock.error;
}
