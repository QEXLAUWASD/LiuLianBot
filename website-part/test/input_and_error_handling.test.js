const test = require('node:test');
const assert = require('node:assert/strict');
const { validateString } = require('../src/db');
const { AppError } = require('../src/errors');
const { errorHandler } = require('../src/middleware/error_handler');

test('parameterized-query inputs may contain punctuation and SQL words', () => {
  assert.equal(validateString("O'Brien; SELECT", 'display'), "O'Brien; SELECT");
});

test('error handler exposes stable AppError but hides unexpected details', () => {
  const makeRes = () => ({
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  });
  const expected = makeRes();
  errorHandler(
    new AppError('Conflict', 409, 'CONFLICT'),
    { requestId: 'req-1' },
    expected,
    () => {}
  );
  assert.deepEqual(expected.body, {
    error: 'Conflict',
    code: 'CONFLICT',
    request_id: 'req-1',
  });

  const hidden = makeRes();
  const originalConsoleError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    errorHandler(
      new Error('mysql password leaked'),
      { requestId: 'req-2' },
      hidden,
      () => {}
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(hidden.statusCode, 500);
  assert.equal(hidden.body.error, 'Internal server error');
  assert.equal(logged.length, 1);
});
