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

test('background cleanup failure does not disconnect the session store', async () => {
  const store = new MySqlSessionStore({
    getPool: async () => ({
      execute: async () => {
        throw new Error('temporary database failure');
      },
    }),
  });
  const disconnects = [];
  const originalError = console.error;
  let loggedError;
  store.on('disconnect', err => disconnects.push(err));
  console.error = (...args) => { loggedError = args; };

  try {
    store.startCleanup(1);
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally {
    store.stopCleanup();
    console.error = originalError;
  }

  assert.deepEqual(disconnects, []);
  assert.equal(loggedError[0], '[SessionStore] Expired-session cleanup failed:');
  assert.match(loggedError[1].message, /temporary database failure/);
});
