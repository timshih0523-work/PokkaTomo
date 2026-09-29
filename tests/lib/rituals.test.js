import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRitual, ritualPromptLine } from '../../server/lib/rituals.js';

const cases = {
  morning: ['早安', '早安～', '早呀', '早上好呀', 'おはよう！', 'おはよー', 'おはようございます', 'good morning'],
  leaving: ['我出門了', '出門囉', '我出門上班了', 'いってきます！', '行ってくるね'],
  home: ['我回來了', '我到家了', 'ただいまー', '帰ったよ'],
  goodnight: ['晚安', '晚安啦 😴', '晚安明天見', '我要睡了', 'おやすみなさい', '寝るね', 'good night']
};

for (const [type, list] of Object.entries(cases)) {
  test(`認得「${type}」`, () => {
    for (const text of list) assert.equal(detectRitual(text), type, text);
  });
}

test('一般聊天不會被誤判成儀式', () => {
  for (const text of [
    '早餐吃什麼', // 測試時真的抓到過：「早呀」去掉語助詞剩「早」
    '早點睡',
    '早起好累',
    '我回來了之後一直在想工作的事',
    '今天晚安不想睡',
    '你好',
    '',
    '   '
  ]) {
    assert.equal(detectRitual(text), null, text);
  }
});

test('每種儀式都有給模型的提示；回家時知道出門幾小時', () => {
  for (const r of ['morning', 'leaving', 'home', 'goodnight']) assert.ok(ritualPromptLine(r).length > 0);
  assert.match(ritualPromptLine('home', { awayHours: 5 }), /5 小時/);
  assert.equal(ritualPromptLine(null), '');
});
