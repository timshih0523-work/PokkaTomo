// scripts/bundle.js
// `npm run bundle` 會跑這個檔案：先確定前端已經編譯過，再把整個專案
// （排除 node_modules / .git / 舊的 zip）打包成一個乾淨的 zip，
// 方便直接傳給非技術使用者（例如：AirDrop、雲端硬碟）。
//
// macOS 內建 `zip` 指令，所以這裡直接用 child_process 呼叫它，
// 不需要額外安裝任何 npm 套件。

import { execSync } from 'child_process';
import { existsSync, readdirSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'server', 'public');
const ZIP_NAME = 'pokkatomo-apple-bundle.zip';

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function main() {
  if (process.platform !== 'darwin') {
    console.warn('⚠️ 這個打包腳本預期在 macOS 上執行（會用到內建的 zip / start-pokkatomo.command）。');
  }

  // 確保前端是最新的
  if (!existsSync(PUBLIC_DIR) || readdirSync(PUBLIC_DIR).length === 0) {
    console.log('尚未編譯前端，先執行 vite build...');
    run('npm run build');
  } else {
    console.log('偵測到已編譯的 server/public，直接使用（如需強制重建，先手動刪除該資料夾再執行 bundle）。');
  }

  const zipPath = path.join(ROOT, ZIP_NAME);
  if (existsSync(zipPath)) {
    rmSync(zipPath);
  }

  // 排除不需要交給使用者的東西：node_modules、.git、.env（可能有敏感金鑰）、舊 zip、log，
  // 以及這台電腦上所有的資料（server/data/：角色、對話、日記、密碼、備份、紀錄檔）——
  // 那是開發者自己測試時的內容，不應該跟著送到對方手上。對方第一次打開時會先設密碼、再自己新增第一個角色。
  const excludes = [
    'node_modules/*',
    '.git/*',
    '.env',
    '*.zip',
    'pokkatomo.log',
    '.DS_Store',
    'server/data/*',
    // 語音辨識小幫手是在每台 Mac 上自己編譯的（簽章跟權限都跟著那台電腦）
    'server/native/build/*',
    // 自動測試是給開發者用的，她的電腦不需要
    'tests/*'
  ];
  const excludeArgs = excludes.map((p) => `-x "${p}"`).join(' ');

  run(`zip -r "${ZIP_NAME}" . ${excludeArgs}`);
  console.log(`\n✅ 打包完成：${zipPath}`);
  console.log('把這個 zip 傳給對方、解壓縮後，雙擊 start-pokkatomo.command 就能啟動。');
}

main();
