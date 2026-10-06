const test = require('node:test');
const assert = require('node:assert/strict');

test('importing the app factory does not listen on a port', () => {
  const appModule = require('../src/app');
  assert.equal(typeof appModule.createApp, 'function');
});
test('home redirect tolerates a request without session state', () => {
  const { homeRedirectPath } = require('../src/app');
  assert.equal(homeRedirectPath(undefined), '/login.html');
  assert.equal(homeRedirectPath({ user: { id: 'u1' } }), '/index.html');
});

test('API auth returns 401 while page auth redirects', () => {
  const { requireApiAuth, requirePageAuth } = require('../src/middleware/auth');
  const apiRes = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  requireApiAuth({ session: {} }, apiRes, () => assert.fail('must not continue'));
  assert.equal(apiRes.statusCode, 401);

  const pageRes = {
    location: null,
    redirect(value) {
      this.location = value;
    },
  };
  requirePageAuth({ session: {} }, pageRes, () => assert.fail('must not continue'));
  assert.equal(pageRes.location, '/login.html');
});

test('app factory protects HTML and serves public Clash subscriptions before static files', async () => {
  const express = require('express');
  const { createApp } = require('../src/app');
  const router = () => express.Router();
  const token = 'a'.repeat(64);
  let active = true;
  const { subscription } = require('../src/routes/clash').createRouters({ db: { getSubscription: async value => active && value === token ? { expires_at: new Date('2099-01-01'), servers: [{ name: 'VPN node', proxy_json: JSON.stringify({ type: 'trojan', server: 'vpn.example.com', port: 443, password: 'test' }) }] } : null } });
  const app = createApp({
    sessionOptions: {
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, sameSite: 'strict' },
    },
    routers: {
      auth: router(),
      roller: router(),
      adminConnections: router(),
      admin: router(),
      connections: router(),
      connectionProxy: router(),
      clashSubscription: subscription,
    },
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    for (const page of ['/account.html', '/chromium.html']) {
      const response = await fetch(`http://127.0.0.1:${port}${page}`, {
        redirect: 'manual',
      });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/login.html');
    }
    for (const prefix of ['/clash-sub-public', '/clash-sub']) {
      const response = await fetch(`http://127.0.0.1:${port}${prefix}/${token}.yaml`, { redirect: 'manual' });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('content-type'), /application\/yaml/);
      assert.match(await response.text(), /MATCH,VPN/);
    }
    active = false;
    for (const prefix of ['/clash-sub-public', '/clash-sub']) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${prefix}/${token}.yaml`)).status, 404);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
