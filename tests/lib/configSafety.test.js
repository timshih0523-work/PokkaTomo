// 跑測試時，沒指定資料夾也絕對不能寫到 server/data（使用者真正的資料）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

test('沒呼叫 setupTestEnv 的測試：DATA_DIR 在暫存資料夾，不是 server/data', async () => {
  delete process.env.POKKATOMO_DATA_DIR;
  const { DATA_DIR, LOG_DIR } = await import('../../server/config.js');
  const real = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server', 'data');
  assert.notEqual(path.resolve(DATA_DIR), path.resolve(real));
  assert.ok(DATA_DIR.startsWith(os.tmpdir()));
  assert.ok(LOG_DIR.startsWith(os.tmpdir()));
});
