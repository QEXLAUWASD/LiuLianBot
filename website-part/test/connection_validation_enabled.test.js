const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConnectionInput } = require('../src/services/connection_validation');

test('requires enabled to be a boolean when provided', () => {
  assert.throws(
    () => normalizeConnectionInput({
      name: 'Dashboard',
      slug: 'dashboard',
      target_url: 'http://localhost:8080/',
      enabled: 'true',
    }),
    /Enabled must be a boolean/
  );
});

test('defaults hidden and legacy proxy routing to false and requires booleans when provided', () => {
  const base = {
    name: 'Dashboard',
    slug: 'dashboard',
    target_url: 'http://localhost:8080/',
  };

  assert.equal(normalizeConnectionInput(base).hidden, false);
  assert.equal(normalizeConnectionInput(base).legacy_proxy_routing, false);
  assert.throws(
    () => normalizeConnectionInput({ ...base, hidden: 'true' }),
    /Hidden must be a boolean/
  );
  assert.throws(
    () => normalizeConnectionInput({ ...base, legacy_proxy_routing: 'true' }),
    /Legacy proxy routing must be a boolean/
  );
});
