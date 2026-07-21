class AccountInputError extends Error {}

function normalizeUsername(value) {
  if (typeof value !== 'string') {
    throw new AccountInputError('Username is required');
  }

  const username = value.trim();
  if (username.length < 3 || username.length > 20) {
    throw new AccountInputError('Username must be 3-20 characters');
  }

  return username;
}

function validateNewPassword(value) {
  if (typeof value !== 'string') {
    throw new AccountInputError('Password is required');
  }
  if (value.length < 6 || value.length > 128) {
    throw new AccountInputError('Password must be 6-128 characters');
  }

  return value;
}

function validatePasswordChange(currentPassword, newPassword, confirmPassword) {
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    throw new AccountInputError('Current password is required');
  }

  const password = validateNewPassword(newPassword);
  if (password !== confirmPassword) {
    throw new AccountInputError('New passwords do not match');
  }

  return { currentPassword, newPassword: password };
}

module.exports = {
  AccountInputError,
  normalizeUsername,
  validateNewPassword,
  validatePasswordChange,
};
