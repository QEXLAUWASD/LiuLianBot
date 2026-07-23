const test = require('node:test');
const assert = require('node:assert/strict');
const { AUTH_RATE_LIMIT } = require('../src/middleware/auth_rate_limit');

test('auth limiter has a bounded window and request count', () => {
  assert.equal(AUTH_RATE_LIMIT.windowMs, 15 * 60 * 1000);
  assert.equal(AUTH_RATE_LIMIT.limit, 10);
  assert.equal(AUTH_RATE_LIMIT.standardHeaders, 'draft-7');
  assert.equal(AUTH_RATE_LIMIT.legacyHeaders, false);
});
