import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.HOST = '127.0.0.1';
const { localOnly } = await import('../../server/lib/localOnly.js');

function run(host) {
  let nextCalled = false;
  let status = 200;
  const res = {
    status(s) {
      status = s;
      return this;
    },
    json() {}
  };
  localOnly({ headers: { host } }, res, () => (nextCalled = true));
  return nextCalled ? 'allowed' : status;
}

test('本機的 Host 放行', () => {
  for (const h of ['localhost:3000', '127.0.0.1:3000', 'localhost', '[::1]:3000', 'LOCALHOST:3000']) {
    assert.equal(run(h), 'allowed', h);
  }
});

test('其他 Host（DNS rebinding）擋掉', () => {
  for (const h of ['evil.example.com', 'evil.example.com:3000', '192.168.1.5:3000', '', 'localhost.evil.com']) {
    assert.equal(run(h), 403, h);
  }
});
