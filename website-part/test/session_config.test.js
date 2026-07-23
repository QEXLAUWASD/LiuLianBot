const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSessionOptions } = require('../src/config/session');

test('production requires an explicit session secret', () => {
  assert.throws(
    () => buildSessionOptions({ NODE_ENV: 'production' }, {}),
    /SESSION_SECRET/
  );
});

test('production cookies are secure and development cookies are not', () => {
  const production = buildSessionOptions(
    { NODE_ENV: 'production', SESSION_SECRET: 'test-secret' },
    {}
  );
  const development = buildSessionOptions({}, {});

  assert.equal(production.cookie.secure, true);
  assert.equal(development.cookie.secure, false);
  assert.equal(production.cookie.httpOnly, true);
  assert.equal(production.cookie.sameSite, 'strict');
});
