const test = require('node:test');
const assert = require('node:assert/strict');

test('database DATETIME values are always interpreted as UTC', () => {
  const { buildPoolOptions } = require('../src/db/pool');
  assert.equal(buildPoolOptions({}).timezone, 'Z');
});
