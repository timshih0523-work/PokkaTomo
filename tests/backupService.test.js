import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, mkdirSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
const backup = await import('../server/backupService.js');
const { appendToArchive } = await import('../server/archiveService.js');
const { BACKUP_KEEP } = await import('../server/config.js');
after(() => env.cleanup());

const backupDir = () => path.join(env.dataDir, 'backups', 'daily');

test('沒有任何資料時不備份', async () => {
  rmSync(env.dataDir, { recursive: true, force: true }); // 連預設角色都沒有
  assert.equal(await backup.runDailyBackup(new Date(2026, 8, 1)), null);
});

test('備份 app/ 與 characters/（backups/daily/日期/）；同一天只備份一次', async () => {
  env.writeData('app/security.json', { algo: 'scrypt' });
  env.writeChar('user.json', { nickname: '小美' });
  env.writeChar('diary.json', []);
  await appendToArchive([{ role: 'user', content: '嗨', ts: new Date(2026, 8, 1).getTime() }]);
  const target = await backup.runDailyBackup(new Date(2026, 8, 1, 9));
  assert.ok(target.endsWith(path.join('daily', '2026-09-01')));
  assert.deepEqual(readdirSync(target).sort(), ['app', 'characters']);
  assert.equal(JSON.parse(readFileSync(path.join(target, 'characters', '001', 'user.json'))).nickname, '小美');
  assert.ok(existsSync(path.join(target, 'characters', '001', 'conversations', '2026-09.jsonl')));
  assert.equal(await backup.runDailyBackup(new Date(2026, 8, 1, 20)), null, '同一天第二次不做');
  backup._resetBackupMemo();
  assert.equal(await backup.runDailyBackup(new Date(2026, 8, 1, 21)), null, '重新啟動後，資料夾已存在也不重做');
});

test(`只保留最近 ${BACKUP_KEEP} 份，未完成的暫存資料夾會清掉`, async () => {
  mkdirSync(path.join(backupDir(), '2026-09-01.tmp-123'), { recursive: true });
  for (let d = 2; d <= BACKUP_KEEP + 5; d++) {
    await backup.runDailyBackup(new Date(2026, 8, d));
  }
  const left = readdirSync(backupDir()).sort();
  assert.equal(left.length, BACKUP_KEEP);
  assert.ok(!left.includes('2026-09-01'));
  assert.ok(!left.some((n) => n.includes('.tmp-')));
});
