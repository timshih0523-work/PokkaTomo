import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voicesForLanguage, voiceQuality, sortVoices, pickVoice, voiceLabel, sanitizeForSpeech, loadVoices } from '../../web/src/voices.js';

const V = [
  { name: 'Tingting', lang: 'zh-CN', voiceURI: 'tt' },
  { name: 'Meijia', lang: 'zh-TW', voiceURI: 'mj' },
  { name: 'Meijia (Enhanced)', lang: 'zh-TW', voiceURI: 'mje' },
  { name: 'Google 國語（臺灣）', lang: 'zh-TW', voiceURI: 'g' },
  { name: 'Sinji', lang: 'zh-HK', voiceURI: 'hk' },
  { name: 'Kyoko', lang: 'ja-JP', voiceURI: 'ky' },
  { name: 'O-ren (Premium)', lang: 'ja-JP', voiceURI: 'or' },
  { name: 'Samantha', lang: 'en-US', voiceURI: 'sa' }
];

test('依語言篩選（中文不含粵語）', () => {
  assert.deepEqual(voicesForLanguage(V, 'zh').map((v) => v.voiceURI), ['tt', 'mj', 'mje', 'g']);
  assert.deepEqual(voicesForLanguage(V, 'ja').map((v) => v.voiceURI), ['ky', 'or']);
});

test('品質排序：Premium／優化 > Google > 一般；台灣口音加分', () => {
  assert.ok(voiceQuality(V[2]) > voiceQuality(V[3]));
  assert.ok(voiceQuality(V[3]) > voiceQuality(V[1]));
  assert.ok(voiceQuality(V[1]) > voiceQuality(V[0]));
  assert.equal(sortVoices(voicesForLanguage(V, 'zh'))[0].voiceURI, 'mje');
  assert.match(voiceLabel(V[6]), /^★★★ /);
});

test('pickVoice：有選就用選的，這台沒有就自動挑最好的', () => {
  assert.equal(pickVoice(V, 'zh', 'g').voiceURI, 'g');
  assert.equal(pickVoice(V, 'zh', 'not-here').voiceURI, 'mje');
  assert.equal(pickVoice(V, 'ja', '').voiceURI, 'or');
  assert.equal(pickVoice([], 'zh', ''), null);
});

test('唸之前拿掉表情符號、波浪號、刪節號、動作描述', () => {
  assert.equal(sanitizeForSpeech('嘿嘿～好開心 😆💕'), '嘿嘿，好開心');
  assert.equal(sanitizeForSpeech('（眨眨眼）你在看我嗎？'), '你在看我嗎？');
  assert.equal(sanitizeForSpeech('嗯⋯⋯我想想…'), '嗯，我想想');
  assert.equal(sanitizeForSpeech('♪～'), '');
});

test('loadVoices：一開始是空的會等 voiceschanged', async () => {
  let listener;
  let list = [];
  const synth = {
    getVoices: () => list,
    addEventListener: (_e, fn) => (listener = fn),
    removeEventListener: () => {}
  };
  const p = loadVoices(synth, 1000);
  list = [V[0]];
  listener();
  assert.equal((await p).length, 1);
  assert.deepEqual(await loadVoices(null), []);
});
