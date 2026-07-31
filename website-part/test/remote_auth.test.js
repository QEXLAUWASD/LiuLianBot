const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedRemoteGroups, hasRemoteAccess } = require('../src/middleware/remote_auth');

test('remote access groups default to admin and support comma-separated groups', () => {
  assert.deepEqual([...allowedRemoteGroups('')], ['admin']);
  assert.deepEqual([...allowedRemoteGroups('admin, server-operator, INVALID!')], ['admin', 'server-operator']);
});

test('remote access accepts any assigned configured user group', () => {
  const allowed = allowedRemoteGroups('server-operator');
  assert.equal(hasRemoteAccess(['user', 'server-operator'], allowed), true);
  assert.equal(hasRemoteAccess(['user'], allowed), false);
});
