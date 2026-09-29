// 假的 `fm` 指令（Apple Foundation Models CLI 的替身），由 env.js 複製成可執行檔。
// 行為由一個 JSON 檔控制，測試可以隨時改：
//   { available: true,             // `fm available` 成功與否
//     reply: '[mood:calm] 好的～',  // 預設回覆
//     byKind: { greet: '...', diary: '...', extract: '...', fortune: '...' },  // 依呼叫種類的回覆
//     fail: '錯誤訊息',             // 設了就以 exit 1 + stderr 失敗
//     failKinds: ['greet'],         // 只讓某些種類失敗
//     failIfMessageIncludes: '…',   // 只有訊息裡包含這段文字時才失敗（例如「有帶對話紀錄時」）
//     delayMs: 0 }
// 每次呼叫都 append 一行 JSON 到呼叫紀錄，測試用來檢查「有沒有呼叫」「prompt 內容對不對」。
const fs = require('fs');
const BEHAVIOR = __BEHAVIOR_PATH__;
const CALLS = __CALLS_PATH__;

const args = process.argv.slice(2);
let b = {};
try { b = JSON.parse(fs.readFileSync(BEHAVIOR, 'utf-8')); } catch {}

if (args[0] === 'available') {
  if (b.available === false) { process.stderr.write('Apple Intelligence is not enabled'); process.exit(1); }
  process.stdout.write('AFM ready (fake)');
  process.exit(0);
}

const instructions = args[2] || '';
const message = args[3] || '';
let kind = 'chat';
if (instructions.includes('記憶擷取小助手')) kind = 'extract';
else if (instructions.includes('寫日記的時間')) kind = 'diary';
else if (message.includes('主動先打招呼')) kind = 'greet';
else if (message.includes('按了「今日占卜」')) kind = 'fortune';

fs.appendFileSync(CALLS, JSON.stringify({ kind, args, instructions, message }) + '\n');

const finish = () => {
  const kindMatches = !b.failKinds || b.failKinds.includes(kind);
  const textMatches = !b.failIfMessageIncludes || message.includes(b.failIfMessageIncludes);
  if (b.fail && kindMatches && textMatches) {
    process.stderr.write(b.fail);
    process.exit(1);
  }
  const reply = (b.byKind && b.byKind[kind] !== undefined) ? b.byKind[kind] : (b.reply !== undefined ? b.reply : '[mood:calm] 好的～');
  process.stdout.write(reply);
  process.exit(0);
};
if (b.delayMs) setTimeout(finish, b.delayMs); else finish();
