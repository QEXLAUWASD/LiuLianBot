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
