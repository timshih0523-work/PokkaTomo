import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZip, crc32 } from '../../server/lib/zip.js';
import { readZip } from '../helpers/readZip.js';

test('crc32 標準測試值', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('產生的 zip 可以讀回來：中文檔名、壓縮與不壓縮', () => {
  const long = '聊天紀錄'.repeat(500);
  const zip = createZip([
    { name: 'a/對話紀錄.txt', data: long },
    { name: 'a/x.json', data: '{}' },
    { name: 'a/b.bin', data: Buffer.from([1, 2, 3]) }
  ]);
  const files = readZip(zip);
  assert.equal(files['a/對話紀錄.txt'], long);
  assert.equal(files['a/x.json'], '{}');
  assert.equal(Object.keys(files).length, 3);
  assert.ok(zip.length < long.length, '長文字有壓縮');
});

