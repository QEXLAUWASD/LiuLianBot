const test = require('node:test');
const assert = require('node:assert/strict');
const {
  UserGroupInputError,
  normalizeRoleIds,
} = require('../src/services/user_group_validation');

test('normalizes multiple group IDs and removes duplicates', () => {
  assert.deepEqual(normalizeRoleIds([2, 1, 2, 3]), [2, 1, 3]);
});

test('requires at least one group', () => {
  assert.throws(() => normalizeRoleIds([]), UserGroupInputError);
  assert.throws(() => normalizeRoleIds(null), /At least one group/);
});

test('rejects non-integer and non-positive group IDs', () => {
  assert.throws(() => normalizeRoleIds(['2']), /positive integers/);
  assert.throws(() => normalizeRoleIds([0]), /positive integers/);
  assert.throws(() => normalizeRoleIds([1.5]), /positive integers/);
});
