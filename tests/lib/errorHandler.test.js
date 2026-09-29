import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../../server/lib/errorHandler.js';
import { BadRequestError, FmUnavailableError, FmRespondError, AppError } from '../../server/lib/errors.js';
import { asyncHandler } from '../../server/lib/asyncHandler.js';

function run(err) {
  const out = {};
  const res = {
    status(s) {
      out.status = s;
      return this;
    },
    json(b) {
      out.body = b;
    }
  };
  const origError = console.error;
  console.error = () => {};
  try {
    errorHandler(err, {}, res, () => {});
  } finally {
    console.error = origError;
  }
  return out;
}

test('自訂錯誤：用它自己的 status 跟 code', () => {
  assert.deepEqual(run(new BadRequestError('空的')), { status: 400, body: { error: 'bad_request', message: '空的' } });
  assert.equal(run(new FmUnavailableError('x')).status, 503);
  assert.equal(run(new FmRespondError('x')).body.error, 'fm_error');
  assert.equal(run(new AppError('x', { status: 418, code: 'teapot' })).status, 418);
});

test('意外的錯誤（程式 bug、硬碟壞了）：一樣回 JSON 500，不洩漏內部訊息', () => {
  const r = run(new Error('ENOENT /Users/someone/secret/path'));
  assert.equal(r.status, 500);
  assert.equal(r.body.error, 'internal_error');
  assert.ok(!r.body.message.includes('/Users'));
});

test('asyncHandler：async 路由丟出的錯誤會交給 next（Express 4 自己不會，請求會整個掛住）', async () => {
  let received;
  const handler = asyncHandler(async () => {
    throw new Error('boom');
  });
  await handler({}, {}, (err) => (received = err));
  assert.equal(received.message, 'boom');
});
