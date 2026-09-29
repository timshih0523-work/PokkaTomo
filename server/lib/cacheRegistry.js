// cacheRegistry.js
// 各 service 放在記憶體裡的快取（RAG 索引、封存匯入狀態、日記版本、天氣…）。
// 資料檔被「整批換掉」時（刪除角色、匯入備份），這些快取要跟著清掉，不然會繼續用舊資料。
// 每個有快取的模組自己註冊一個清除函式；刪角色／匯入時呼叫 resetCaches()。

const resetters = [];

/** @param {(characterId: string|null) => void} fn  characterId = null 代表全部角色 */
export function onCacheReset(fn) {
  resetters.push(fn);
}

/** 清掉某個角色（或 null = 全部）的記憶體快取。 */
export function resetCaches(characterId = null) {
  for (const fn of resetters) {
    try {
      fn(characterId);
    } catch {
      /* 清快取失敗不影響主流程 */
    }
  }
}
