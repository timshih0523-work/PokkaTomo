// 手機的「按住說話」：錄音傳到 Mac 辨識（speechService.js、routes/speech.js）。
// 真的辨識要 macOS；這裡用假的辨識程式（POKKATOMO_SPEECH_BIN），參數與輸出格式跟真的一樣。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, chmodSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { setupTestEnv } from './helpers/env.js';

const env = setupTestEnv();
const fakeBin = path.join(env.root, 'fake-speech');
const callsPath = path.join(env.root, 'speech-calls.jsonl');
const modePath = path.join(env.root, 'speech-mode');
writeFileSync(modePath, 'ok');
writeFileSync(
  fakeBin,
  `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ args, fileExists: args[0] !== '--authorize' && fs.existsSync(args[0]) }) + '\\n');
const mode = fs.readFileSync(${JSON.stringify(modePath)}, 'utf-8');
if (args[0] === '--authorize') { console.log(JSON.stringify({ status: mode === 'denied' ? 'denied' : 'authorized' })); process.exit(0); }
if (mode === 'fail') { console.log(JSON.stringify({ error: 'recognition_failed', message: 'boom' })); process.exit(6); }
if (mode === 'silent') { console.log(JSON.stringify({ text: '', onDevice: true })); process.exit(0); }
console.log('some log line');
console.log(JSON.stringify({ text: args[1] === 'ja-JP' ? ' こんにちは ' : '你好', onDevice: true }));
`
);
chmodSync(fakeBin, 0o755);
process.env.POKKATOMO_SPEECH_BIN = fakeBin;

const { createApp } = await import('../server/app.js');
const speech = await import('../server/speechService.js');

let server;
let base;
let token;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await (await fetch(`${base}/api/lock/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '2580' }) })).json()).token;
});
after(() => {
  server.close();
  env.cleanup();
});

// 最小的 WAV：16kHz 單聲道 16-bit，0.5 秒靜音
function wav(seconds = 0.5) {
  const n = Math.round(16000 * seconds);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(n * 2, 40);
  return b;
}

const post = (body, character) =>
  fetch(`${base}/api/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', 'X-PokkaTomo-Token': token, ...(character ? { 'X-PokkaTomo-Character': character } : {}) },
    body
  });

const calls = () =>
  existsSync(callsPath)
    ? readFileSync(callsPath, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];

test('還沒準備好：503 speech_unavailable；/api/config 說不能用', async () => {
  const r = await post(wav());
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'speech_unavailable');
  assert.equal((await (await fetch(`${base}/api/config`)).json()).serverSpeech, false);
});

test('準備好（有權限）之後：用角色說話的語言辨識；暫存音檔會刪掉', async () => {
  const st = await speech.prepareSpeech();
  assert.equal(st.available, true);
  assert.equal((await (await fetch(`${base}/api/config`)).json()).serverSpeech, true);

  const r = await post(wav());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { text: '你好' });
  const last = calls().at(-1);
  assert.equal(last.args[1], 'zh-TW');
  assert.equal(last.fileExists, true, '執行時音檔在');
  assert.ok(!existsSync(last.args[0]), '辨識完暫存音檔刪掉了');

  const ja = (await (await fetch(`${base}/api/characters`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PokkaTomo-Token': token }, body: JSON.stringify({ language: 'ja' }) })).json()).character;
  assert.deepEqual(await (await post(wav(), ja.id)).json(), { text: 'こんにちは' });
  assert.equal(calls().at(-1).args[1], 'ja-JP');
});

test('沒聽到聲音 → 空字串；辨識失敗 → 500 speech_failed；不是 WAV → 400', async () => {
  writeFileSync(modePath, 'silent');
  assert.deepEqual(await (await post(wav())).json(), { text: '' });
  writeFileSync(modePath, 'fail');
  const f = await post(wav());
  assert.equal(f.status, 500);
  assert.equal((await f.json()).error, 'speech_failed');
  writeFileSync(modePath, 'ok');
  const bad = await post(Buffer.from('hello this is not audio at all, definitely not a wav file.'));
  assert.equal(bad.status, 400);
});

test('要密碼', async () => {
  const r = await fetch(`${base}/api/speech`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav() });
  assert.equal(r.status, 401);
});

test('Mac 上沒允許語音辨識 → 狀態顯示 denied、不能用', async () => {
  writeFileSync(modePath, 'denied');
  const st = await speech.prepareSpeech({ force: true });
  assert.equal(st.auth, 'denied');
  assert.equal(st.available, false);
  assert.equal((await post(wav())).status, 503);
});
