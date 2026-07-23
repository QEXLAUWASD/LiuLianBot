const test = require('node:test');
const assert = require('node:assert/strict');
const {
  establishUserSession,
  revokeOtherUserSessions,
} = require('../src/services/session');

test('establishUserSession regenerates before saving the user', async () => {
  const order = [];
  const req = {
    session: {
      cookie: {},
      regenerate(callback) {
        order.push('regenerate');
        callback();
      },
      save(callback) {
        order.push('save');
        callback();
      },
    },
  };

  await establishUserSession(req, { id: 'u1', username: 'name' }, 1234);

  assert.deepEqual(order, ['regenerate', 'save']);
  assert.deepEqual(req.session.user, { id: 'u1', username: 'name' });
  assert.equal(req.session.cookie.maxAge, 1234);
});

test('password change revokes every other session for the user', async () => {
  const calls = [];
  const req = {
    sessionID: 'current-sid',
    sessionStore: {
      destroyUserSessions(userId, exceptSid, callback) {
        calls.push([userId, exceptSid]);
        callback();
      },
    },
  };

  await revokeOtherUserSessions(req, 'u1');

  assert.deepEqual(calls, [['u1', 'current-sid']]);
});
