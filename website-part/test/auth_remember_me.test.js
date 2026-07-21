const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

async function createAuthServer() {
  const dbPath = require.resolve('../src/db');
  const authPath = require.resolve('../src/routes/auth');
  const accountPath = require.resolve('../src/routes/account');
  const passwordHash = await bcrypt.hash('test-password', 4);

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      findUserByUsername: async username => ({
        id: 'user-1',
        username,
        password: passwordHash,
      }),
      createUser: async () => null,
      findUserById: async () => null,
      findUserCredentialsById: async () => null,
      updateUsername: async () => null,
      updatePasswordHash: async () => null,
    },
  };
  delete require.cache[authPath];
  delete require.cache[accountPath];

  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'remember-me-test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict' },
  }));
  app.use(require(authPath));

  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    login: remember => fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'player-one',
        password: 'test-password',
        remember,
      }),
    }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('regular login creates a browser-session cookie', async t => {
  const fixture = await createAuthServer();
  t.after(fixture.close);

  const response = await fixture.login(false);
  const cookie = response.headers.get('set-cookie');

  assert.equal(response.status, 200);
  assert.match(cookie, /HttpOnly/i);
  assert.doesNotMatch(cookie, /Expires=|Max-Age=/i);
});

test('remember me creates a persistent 30-day cookie', async t => {
  const fixture = await createAuthServer();
  t.after(fixture.close);

  const response = await fixture.login(true);
  const cookie = response.headers.get('set-cookie');

  assert.equal(response.status, 200);
  assert.match(cookie, /Expires=/i);

  const expires = /Expires=([^;]+)/i.exec(cookie);
  const remainingDays = (Date.parse(expires[1]) - Date.now()) / 86400000;
  assert.ok(remainingDays > 29.9 && remainingDays <= 30);
});

test('remember me only accepts a boolean', async t => {
  const fixture = await createAuthServer();
  t.after(fixture.close);

  const response = await fixture.login('yes');
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Remember me must be a boolean' });
});
