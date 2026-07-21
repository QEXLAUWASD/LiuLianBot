const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');

async function createTestServer({ authenticated = true } = {}) {
  const dbPath = require.resolve('../src/db');
  const accountPath = require.resolve('../src/routes/account');
  const user = {
    id: 'user-1',
    username: 'player-one',
    password: await bcrypt.hash('old-password', 4),
  };
  let latestSession;

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      findUserByUsername: async username => (
        username.toLowerCase() === 'taken-name'
          ? { id: 'user-2', username: 'taken-name' }
          : username.toLowerCase() === user.username.toLowerCase() ? user : null
      ),
      findUserCredentialsById: async id => id === user.id ? user : null,
      updateUsername: async (id, username) => {
        assert.equal(id, user.id);
        user.username = username;
        return user;
      },
      updatePasswordHash: async (id, password) => {
        assert.equal(id, user.id);
        user.password = password;
      },
    },
  };
  delete require.cache[accountPath];
  const accountRoutes = require(accountPath);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    latestSession = authenticated
      ? {
          user: { id: user.id, username: user.username },
          destroy: callback => callback(),
        }
      : {};
    req.session = latestSession;
    next();
  });
  app.use(accountRoutes);

  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    user,
    latestSession: () => latestSession,
    request: (path, body) => fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('account routes require an authenticated session', async t => {
  const fixture = await createTestServer({ authenticated: false });
  t.after(fixture.close);

  const response = await fixture.request('/username', {});
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Login required' });
});

test('username route verifies password, uniqueness, and updates session', async t => {
  const fixture = await createTestServer();
  t.after(fixture.close);

  let response = await fixture.request('/username', {
    username: 'player-two',
    currentPassword: 'wrong-password',
  });
  assert.equal(response.status, 401);

  response = await fixture.request('/username', {
    username: 'taken-name',
    currentPassword: 'old-password',
  });
  assert.equal(response.status, 409);

  response = await fixture.request('/username', {
    username: '  player-two  ',
    currentPassword: 'old-password',
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.username, 'player-two');
  assert.equal(fixture.user.username, 'player-two');
  assert.equal(fixture.latestSession().user.username, 'player-two');
});

test('password route validates and replaces the password hash', async t => {
  const fixture = await createTestServer();
  t.after(fixture.close);

  let response = await fixture.request('/password', {
    currentPassword: 'old-password',
    newPassword: 'new-password',
    confirmPassword: 'different-password',
  });
  assert.equal(response.status, 400);

  response = await fixture.request('/password', {
    currentPassword: 'old-password',
    newPassword: 'old-password',
    confirmPassword: 'old-password',
  });
  assert.equal(response.status, 400);

  response = await fixture.request('/password', {
    currentPassword: 'old-password',
    newPassword: 'new-password',
    confirmPassword: 'new-password',
  });
  assert.equal(response.status, 200);
  assert.equal(await bcrypt.compare('new-password', fixture.user.password), true);
  assert.equal(await bcrypt.compare('old-password', fixture.user.password), false);
});
