const test = require('node:test');
const assert = require('node:assert/strict');

test('db facade preserves every public function', () => {
  const db = require('../src/db');
  const names = [
    'getPool',
    'findUserByUsername',
    'findUserById',
    'findUserCredentialsById',
    'createUser',
    'updateUsername',
    'updatePasswordHash',
    'validateString',
    'getAllRoles',
    'createRole',
    'updateRole',
    'deleteRole',
    'getAllUsers',
    'updateUserRoles',
    'deleteUser',
    'getAllConnections',
    'getAccessibleConnections',
    'getConnectionAccessBySlug',
    'createConnection',
    'updateConnection',
    'deleteConnection',
    'getAllGuilds',
    'getGuildDetail',
  ];

  for (const name of names) {
    assert.equal(typeof db[name], 'function', name);
  }
});
