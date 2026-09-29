import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { useQuirks } from '../../web/src/composables/useQuirks.js';
import { useAvatarStatus } from '../../web/src/composables/useAvatarStatus.js';
import { getStrings } from '../../web/src/i18n.js';

function makeQuirks({ status = 'IDLE', level = 1, profile = {} } = {}) {
  const st = ref(status);
  const bubbles = [];
  let woke = 0;
  const q = useQuirks({
    status: st,
    strings: () => getStrings('zh'),
    level: () => level,
    profile: () => profile,
    canAct: () => true,
    showBubble: (t) => bubbles.push(t),
    onWake: () => woke++
  });
  return { q, st, bubbles, woke: () => woke };
}

test('3 秒內連戳 5 下 → 頭暈；戳 4 下只是一般反應', () => {
  const { q, bubbles } = makeQuirks();
  for (let i = 0; i < 4; i++) assert.equal(q.handleTap(), false);
  assert.equal(q.handleTap(), true);
  assert.equal(q.quirk.value, 'dizzy');
  assert.ok(getStrings('zh').quirkLines.dizzy.includes(bubbles.at(-1)));
  q.stop();
});

test('睡著時被戳：前兩下嘟囔，第三下醒來', () => {
  const { q, bubbles, woke } = makeQuirks({ status: 'ASLEEP' });
  const t = getStrings('zh');
  assert.equal(q.handleTap(), true);
  assert.equal(q.handleTap(), true);
  assert.equal(woke(), 0);
  assert.ok(t.sleepMumble.includes(bubbles[0]));
  q.handleTap();
  assert.equal(woke(), 1);
  assert.equal(bubbles.at(-1), t.wakeUp);
  q.stop();
});

test('夢話：沒有喜好就不說要喜好的那句；{nick} 只在 4 級以上、有暱稱時才會出現', () => {
  for (let i = 0; i < 50; i++) {
    const line = makeQuirks({ level: 1, profile: {} }).q.sleepTalkLine();
    assert.ok(!line.includes('{pref}') && !line.includes('{nick}'), line);
    assert.ok(!line.includes('好好吃'), '沒有喜好不會夢到吃的');
  }
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(makeQuirks({ level: 4, profile: { nickname: '小美', preferences: ['草莓蛋糕'] } }).q.sleepTalkLine());
  assert.ok([...seen].some((l) => l.includes('草莓蛋糕')), '會夢到喜好');
  assert.ok([...seen].some((l) => l.includes('小美')), '4 級會夢到她的名字');
  for (let i = 0; i < 100; i++) {
    assert.ok(!makeQuirks({ level: 3, profile: { nickname: '小美' } }).q.sleepTalkLine().includes('小美'));
  }
});

test('小動作一段時間後自動結束', async () => {
  const { q } = makeQuirks();
  q.playQuirk('sneeze', { line: false });
  assert.equal(q.quirk.value, 'sneeze');
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(q.quirk.value, null);
});

test('角色狀態：睡著 → ASLEEP；醒來依白天晚上回到 IDLE／SLEEPY；忙的時候不打斷', () => {
  const a = useAvatarStatus();
  a.setAsleep(true);
  assert.equal(a.status.value, 'ASLEEP');
  a.setAsleep(false);
  assert.equal(a.status.value, a.isNight.value ? 'SLEEPY' : 'IDLE');
  a.setStatus('SPEAKING');
  a.setAsleep(true);
  assert.equal(a.status.value, 'SPEAKING', '講話講到一半不會突然睡著');
  a.restToIdle();
  assert.equal(a.status.value, 'ASLEEP', '講完才睡');
});

test('setStatus 的 autoRest：時間到回到平常，但不會蓋掉中途換的新狀態', async () => {
  const a = useAvatarStatus();
  a.setStatus('HAPPY', { autoRestMs: 30 });
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(['IDLE', 'SLEEPY'].includes(a.status.value));
  a.setStatus('HAPPY', { autoRestMs: 30 });
  a.setStatus('THINKING');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(a.status.value, 'THINKING');
});

test('閒著的時候：6 分鐘內一定會做一個小動作；有面板打開／在忙就不做', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const st = ref('IDLE');
  let canAct = true;
  const bubbles = [];
  const q = useQuirks({
    status: st,
    strings: () => getStrings('zh'),
    level: () => 1,
    profile: () => ({}),
    canAct: () => canAct,
    showBubble: (b) => bubbles.push(b)
  });
  q.start();
  t.mock.timers.tick(6 * 60 * 1000 + 1);
  assert.equal(bubbles.length, 1, '做了一個小動作');
  assert.notEqual(q.quirk.value, 'toot', '1 級不會噗');
  canAct = false;
  t.mock.timers.tick(30 * 60 * 1000);
  assert.equal(bubbles.length, 1, '不適合的時候不做');
  q.stop();
});

test('睡著的時候：說夢話（最多 80 秒一次）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const st = ref('ASLEEP');
  const bubbles = [];
  const q = useQuirks({
    status: st,
    strings: () => getStrings('zh'),
    level: () => 1,
    profile: () => ({}),
    canAct: () => true,
    showBubble: (b) => bubbles.push(b)
  });
  q.start();
  t.mock.timers.tick(80 * 1000 + 1);
  assert.ok(bubbles.length >= 1);
  st.value = 'IDLE';
  const n = bubbles.length;
  t.mock.timers.tick(3 * 60 * 1000);
  assert.ok(bubbles.slice(n).every((b) => !getStrings('zh').sleepTalk.includes(b)), '醒來之後不說夢話');
  q.stop();
});
