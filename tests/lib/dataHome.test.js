// 專案資料夾在伺服器開著的時候被改名／搬走：舊伺服器不可以在舊位置長出新資料夾（2026-09-29 真的發生過）
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { setupTestEnv } from '../helpers/env.js';

const gone = path.join(tmpdir(), `pokkatomo-moved-${process.pid}`, 'old_project', 'server');
const env = setupTestEnv({ extraEnv: { POKKATOMO_DATA_DIR: path.join(gone, 'data') } });
after(() => env.cleanup());
const { log, flushLogs } = await import('../../server/lib/logger.js');
const { writeJsonAtomic } = await import('../../server/lib/jsonStore.js');
const { appendToArchive } = await import('../../server/archiveService.js');
const { dataHomeExists } = await import('../../server/lib/dataHome.js');

test('專案資料夾不見了：紀錄檔不寫、JSON 與對話寫入都拒絕，而且不會建出任何資料夾', async () => {
  assert.equal(dataHomeExists(), false);
  log.info('server_stop', { signal: 'SIGTERM' });
  if (typeof flushLogs === 'function') await flushLogs();
  await assert.rejects(writeJsonAtomic(path.join(gone, 'data', 'app', 'x.json'), {}), /專案資料夾被移動/);
  await assert.rejects(appendToArchive([{ role: 'user', content: 'hi' }]), /專案資料夾被移動/);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(existsSync(path.dirname(gone)), false, '舊位置沒有長出資料夾');
});
