const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AccountInputError,
  normalizeUsername,
  validateNewPassword,
  validatePasswordChange,
} = require('../src/services/account_validation');

test('normalizes usernames and enforces username length', () => {
  assert.equal(normalizeUsername('  player-one  '), 'player-one');
  assert.throws(() => normalizeUsername('ab'), AccountInputError);
  assert.throws(() => normalizeUsername('x'.repeat(21)), /3-20 characters/);
  assert.throws(() => normalizeUsername(null), /required/);
});

test('validates new password length', () => {
  assert.equal(validateNewPassword('secret1'), 'secret1');
  assert.throws(() => validateNewPassword('short'), /6-128 characters/);
  assert.throws(() => validateNewPassword('x'.repeat(129)), /6-128 characters/);
});

test('requires the current password and matching new passwords', () => {
  assert.deepEqual(
    validatePasswordChange('old-password', 'new-password', 'new-password'),
    { currentPassword: 'old-password', newPassword: 'new-password' }
  );
  assert.throws(
    () => validatePasswordChange('', 'new-password', 'new-password'),
    /Current password is required/
  );
  assert.throws(
    () => validatePasswordChange('old-password', 'new-password', 'different'),
    /do not match/
  );
});
