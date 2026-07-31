const test = require('node:test');
const assert = require('node:assert/strict');
const { termsRequired } = require('../src/services/terms_config');

test('terms acceptance is required by default and can be disabled by the hoster', () => {
  assert.equal(termsRequired({}), true);
  assert.equal(termsRequired({ TERMS_OF_SERVICE_REQUIRED: 'false' }), false);
  assert.equal(termsRequired({ TERMS_OF_SERVICE_REQUIRED: 'true' }), true);
});
