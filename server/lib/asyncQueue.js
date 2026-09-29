// asyncQueue.js
// 一個很簡單的「同一個 key 依序執行」佇列，用來避免對同一個檔案做
// 「讀取 → 修改 → 寫回」時被別的呼叫插隊，導致其中一次的修改被整個蓋掉（lost update）。
//
// 這個專案是單一使用者、單一 Node 行程，用不到真的檔案鎖或資料庫交易，
// 但至少有兩種情境會讓同一個 JSON 檔案被「差不多同時」讀寫：
//   - 使用者在設定面板按「儲存」的同時，剛好前一輪對話的背景記憶提取
//     (extractFacts) 也在讀/寫 user.json。
//   - 前端已經用 isSending 擋掉同一個分頁連續送出聊天訊息，但這裡再擋一層，
//     防禦之後新增的呼叫路徑（例如未來的多分頁/多裝置）忘記檢查那個旗標。
// 如果兩個「讀取 → 修改 → 寫回」沒有排隊、真的同時發生，後寫完的那次會用
// 自己讀到的舊內容整個覆蓋過去，先寫入的那次修改就會憑空消失，且不會有任何錯誤訊息，
// 是最難察覺的一種 bug。用一個 key 對應一條佇列就能完全避免，成本很低。
//
// 用法：enqueue(檔案路徑, async () => { ...讀取、修改、寫回... })
// 同一個 key 的所有呼叫會依照呼叫順序，一個接一個執行，不會重疊。

const queues = new Map();

export function enqueue(key, task) {
  const previous = queues.get(key) || Promise.resolve();
  const run = previous.then(task, task);
  // 不管這次任務成功或失敗，都要讓佇列繼續往下走，不能讓一次失敗卡住後面所有排隊的呼叫；
  // 呼叫端拿到的還是 run，會正確收到這次任務真正的結果或錯誤。
  queues.set(
    key,
    run.then(
      () => {},
      () => {}
    )
  );
  return run;
}

/**
 * 等所有佇列裡「目前已經排進去」的任務做完。關閉伺服器前呼叫（見 server.js 的
 * graceful shutdown），確保不會在寫檔寫到一半時結束行程。
 */
export function drainAll() {
  return Promise.all(Array.from(queues.values()));
}
