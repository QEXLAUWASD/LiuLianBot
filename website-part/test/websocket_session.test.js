const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { getSessionId, getStoredSession, parseCookies } = require('../src/websocket_session');

function signedCookie(sessionId, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(sessionId)
    .digest('base64')
    .replace(/=+$/, '');
  return encodeURIComponent(`s:${sessionId}.${signature}`);
}

test('reads and verifies an express-session cookie', () => {
  const secret = 'test-secret';
  const header = `theme=dark; connect.sid=${signedCookie('session-123', secret)}`;
  assert.equal(getSessionId(header, 'connect.sid', secret), 'session-123');
  assert.equal(getSessionId(header, 'connect.sid', 'wrong-secret'), null);
});

test('parses cookie values without throwing on invalid encoding', () => {
  assert.deepEqual(parseCookies('one=1; bad=%E0%A4%A'), { one: '1', bad: '%E0%A4%A' });
});

test('loads a session through the configured session store', async () => {
  const store = {
    get(sessionId, callback) {
      callback(null, { user: { id: sessionId } });
    },
  };
  assert.deepEqual(await getStoredSession(store, 'user-1'), { user: { id: 'user-1' } });
});
