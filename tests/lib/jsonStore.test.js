import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { readJson, writeJsonAtomic } from '../../server/lib/jsonStore.js';

const dir = mkdtempSync(path.join(tmpdir(), 'jsonstore-'));
after(() => rmSync(dir, { recursive: true, force: true }));

test('檔案不存在 → 回傳預設值，不建立檔案', async () => {
  assert.deepEqual(await readJson(path.join(dir, 'nope.json'), () => ['x']), ['x']);
  assert.ok(!readdirSync(dir).includes('nope.json'));
});

test('寫入後讀得回來，而且不會留下暫存檔；資料夾不存在會自己建', async () => {
  const p = path.join(dir, 'sub', 'a.json');
  await writeJsonAtomic(p, { a: 1 });
  assert.deepEqual(await readJson(p, () => null), { a: 1 });
  assert.deepEqual(readdirSync(path.join(dir, 'sub')), ['a.json']);
});

test('壞掉的 JSON：備份成 .corrupt-*，回傳預設值，不會默默清空', async () => {
  const p = path.join(dir, 'bad.json');
  writeFileSync(p, '{"nickname": "小美", "broken');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await readJson(p, () => ({})), {});
  } finally {
    console.warn = warn;
  }
  const files = readdirSync(dir);
  assert.ok(!files.includes('bad.json'), '壞檔被移走了');
  assert.ok(files.some((f) => f.startsWith('bad.json.corrupt-')), '有備份');
});
