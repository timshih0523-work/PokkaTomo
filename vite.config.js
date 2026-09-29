import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { PORT } from './server/config.js';

// 前端編譯後直接輸出到 server/public，讓 Express 用同一個 port 靜態託管，
// 使用者只需要開一個網址（http://localhost:PORT），不需要另外跑前端 dev server。
//
// dev proxy 的目標 port 直接 import server/config.js 的 PORT，不要在這裡重複寫死
// 'http://localhost:3000'——之前這裡跟 start-pokkatomo.command 各自寫死一份，
// 三個地方要一起改才不會不一致；現在整個專案只有 config.js 一個地方定義 PORT 的預設值，
// 這裡跟 start-pokkatomo.command 都改成向它要值。
export default defineConfig({
  root: 'web',
  plugins: [vue()],
  build: {
    outDir: '../server/public',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      // 用 127.0.0.1 而不是 localhost：伺服器只聽 IPv4 的 127.0.0.1（見 server/config.js 的 HOST），
      // 新版 Node 可能會先把 localhost 解析成 IPv6 的 ::1，開發模式的 proxy 就會連不上。
      '/api': `http://127.0.0.1:${PORT}`
    }
  }
});
