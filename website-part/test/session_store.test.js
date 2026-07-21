const test = require('node:test');
const assert = require('node:assert/strict');
const { MySqlSessionStore, sessionExpiry } = require('../src/session_store');

function callStore(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (err, value) => err ? reject(err) : resolve(value));
  });
}

test('uses the cookie expiration when persisting a remembered session', () => {
  const expires = new Date(Date.now() + 30 * 86400000);
  assert.equal(sessionExpiry({ cookie: { expires } }, 1000), expires.getTime());
});

test('falls back to server TTL for browser-session cookies', () => {
  const before = Date.now() + 60000;
  const expiresAt = sessionExpiry({ cookie: {} }, 60000);
  const after = Date.now() + 60000;
  assert.ok(expiresAt >= before && expiresAt <= after);
});

test('stores, retrieves, touches, and destroys sessions with parameterized queries', async () => {
  const calls = [];
  const saved = JSON.stringify({ cookie: {}, user: { id: 'user-1' } });
  const pool = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT')) return [[{ data: saved }]];
      return [{ affectedRows: 1 }];
    },
  };
  const store = new MySqlSessionStore({ getPool: async () => pool });

  await callStore(store, 'set', 'session-1', JSON.parse(saved));
  assert.deepEqual(await callStore(store, 'get', 'session-1'), JSON.parse(saved));
  await callStore(store, 'touch', 'session-1', JSON.parse(saved));
  await callStore(store, 'destroy', 'session-1');

  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0].params.slice(0, 2), ['session-1', saved]);
  assert.deepEqual(calls[1].params[0], 'session-1');
  assert.deepEqual(calls[2].params[1], 'session-1');
  assert.deepEqual(calls[3].params, ['session-1']);
});
