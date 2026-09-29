// app.js
// 組裝 Express app：安全檢查、JSON 解析、靜態網站、/api 路由、SPA fallback、集中錯誤處理。
// 只負責「組裝」，不 listen、不開瀏覽器、不做啟動時的背景工作——那些在 server.js。
// 拆開的原因：自動測試（test/api.test.js）可以直接 createApp() 起一個真的 app 打 API，
// 不會順便開瀏覽器、也不會佔用 3000 port。

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import apiRoutes from './routes/index.js';
import { errorHandler } from './lib/errorHandler.js';
import { localOnly } from './lib/localOnly.js';
import { lanGuard } from './lib/lanGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

/**
 * @param {{ lan?: boolean }} [opts] lan: true = 給「手機／平板連線」那個 port 用（見 lanService.js），改用 lanGuard 檢查
 */
export function createApp({ lan = false } = {}) {
  const app = express();

  // 最先檢查：本機的 port 只接受從這台電腦開的連線（lib/localOnly.js）；手機連線的 port 只接受家裡網路（lib/lanGuard.js）
  app.use(lan ? lanGuard : localOnly);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(PUBLIC_DIR));

  app.use('/api', apiRoutes);

  // 不存在的 /api/* 回 JSON 404。以前沒有這一段：下面的 SPA 規則刻意排除了 /api，
  // 所以會變成 Express 預設的 HTML 404 頁面，前端 res.json() 會解析失敗、變成籠統的網路錯誤。
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: '沒有這個 API' });
  });

  // 任何非 /api 的路徑都交給前端（單頁應用程式路由）。
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  // 一定要放在所有路由後面：Express 用「這個 middleware 有 4 個參數」認出它是錯誤處理器。
  app.use(errorHandler);

  return app;
}
