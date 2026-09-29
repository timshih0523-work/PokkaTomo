import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { setupTestEnv } from '../helpers/env.js';

const env = setupTestEnv();
const { log, pruneLogs, logFilePath } = await import('../../server/lib/logger.js');
after(() => env.cleanup());

test('一行一筆 JSON、本地時間、長字串截斷', async () => {
  await log.info('hello', { n: 1, long: 'x'.repeat(1000), skip: undefined });
  await log.error('boom', { error: 'bad' });
  const lines = readFileSync(logFilePath(), 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].event, 'hello');
  assert.equal(lines[0].level, 'info');
  assert.match(lines[0].t, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  assert.ok(lines[0].long.length < 310);
  assert.ok(!('skip' in lines[0]));
  assert.equal(lines[1].level, 'error');
});

test('舊的紀錄檔會被清掉，其他檔案不動', async () => {
  const dir = path.join(env.dataDir, 'logs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '2020-01-01.log'), '');
  writeFileSync(path.join(dir, 'notes.txt'), '');
  const removed = await pruneLogs(new Date(2026, 8, 28), 30);
  assert.equal(removed, 1);
  assert.ok(!existsSync(path.join(dir, '2020-01-01.log')));
  assert.ok(readdirSync(dir).includes('notes.txt'));
});
