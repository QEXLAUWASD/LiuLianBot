const test = require('node:test');
const assert = require('node:assert/strict');

test('database DATETIME values are always interpreted as UTC', () => {
  const { buildPoolOptions } = require('../src/db/pool');
  const options = buildPoolOptions({});
  assert.equal(options.timezone, 'Z');
  assert.equal(options.supportBigNumbers, true);
  assert.equal(options.bigNumberStrings, true);
});
