const test = require('node:test');
const assert = require('node:assert/strict');
const { MySqlSessionStore } = require('../src/session_store');

test('cleanupExpired deletes all expired sessions', async () => {
  const calls = [];
  const pool = {
    execute: async (sql, params) => calls.push([sql, params]),
  };
  const store = new MySqlSessionStore({ getPool: async () => pool });

  await store.cleanupExpired(12345);

  assert.match(calls[0][0], /DELETE FROM website_sessions/);
  assert.deepEqual(calls[0][1], [12345]);
});
