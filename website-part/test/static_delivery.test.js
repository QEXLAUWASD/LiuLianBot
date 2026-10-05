const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { createApp } = require('../src/app');
const { createRedirectRootRelativeRequest } = require('../src/routes/connection_proxy');

async function fixture(t) {
  const calls = { get: 0, touch: 0, proxy: 0 };
  const store = new session.MemoryStore();
  for (const method of ['get', 'touch']) {
    const original = store[method];
    store[method] = function (...args) {
      calls[method] += 1;
      return original.apply(this, args);
    };
  }
  const auth = express.Router();
  auth.get('/test-session', (req, res) => {
    req.session.user = { id: 'user-1' };
    res.json({ ok: true });
  });
  auth.get('/me', (req, res) => res.json({ user: req.session.user || null }));
  const connectionProxy = express.Router();
  connectionProxy.redirectRootRelativeRequest = createRedirectRootRelativeRequest(async (slug, userId) => {
    calls.proxy += 1;
    assert.equal(slug, 'reports');
    assert.equal(userId, 'user-1');
    return { allowed: true, connection: { legacy_proxy_routing: false } };
  });
  const app = createApp({
    sessionOptions: {
      store,
      secret: 'test-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, sameSite: 'strict' },
    },
    routers: {
      auth,
      roller: express.Router(),
      adminConnections: express.Router(),
      admin: express.Router(),
      connections: express.Router(),
      connectionProxy,
    },
  });
  const server = app.listen(0);
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${origin}/api/auth/test-session`);
  const cookie = login.headers.get('set-cookie').split(';', 1)[0];
  await login.json();
  return { origin, cookie, calls };
}

test('public assets keep cache and security headers without reading or touching sessions', async t => {
  const { origin, cookie, calls } = await fixture(t);
  const asset = readdirSync(path.join(__dirname, '../public/assets')).find(name => name.endsWith('.js'));
  assert.ok(asset, 'the built website includes a fingerprinted script');

  for (const [pathname, cache] of [
    [`/assets/${asset}`, 'public, max-age=31536000, immutable'],
    ['/css/style.css', 'no-cache'],
    ['/img/icon-192.png', 'no-cache'],
    ['/vendor/socket.io.min.js', 'no-cache'],
  ]) {
    const response = await fetch(`${origin}${pathname}`, { headers: { cookie } });
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('cache-control'), cache, pathname);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.ok((await response.arrayBuffer()).byteLength > 0);

    const cached = await fetch(`${origin}${pathname}`, {
      headers: {
        cookie,
        'if-none-match': response.headers.get('etag'),
        // Node fetch otherwise adds no-cache for conditional requests, which
        // asks Express to return a full response instead of exercising 304.
        'cache-control': 'max-age=0',
      },
    });
    assert.equal(cached.status, 304, pathname);
    assert.equal(cached.headers.get('cache-control'), cache);

    const head = await fetch(`${origin}${pathname}`, { method: 'HEAD', headers: { cookie } });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  }

  assert.equal(calls.get, 0);
  assert.equal(calls.touch, 0);
});

test('HTML and API requests still load sessions and protect private pages', async t => {
  const { origin, cookie, calls } = await fixture(t);
  for (const pathname of ['/index.html', '/files.html', '/admin.html']) {
    const response = await fetch(`${origin}${pathname}`, { redirect: 'manual' });
    assert.equal(response.status, 302, pathname);
    assert.equal(response.headers.get('location'), '/login.html');
    await response.text();
  }

  const page = await fetch(`${origin}/files.html`, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-cache');
  assert.match(await page.text(), /<html/);
  assert.equal(calls.get, 1);
  assert.equal(calls.touch, 1);

  const me = await fetch(`${origin}/api/auth/me`, { headers: { cookie } });
  assert.deepEqual(await me.json(), { user: { id: 'user-1' } });
  assert.equal(calls.get, 2);
  assert.equal(calls.touch, 2);

  const share = await fetch(`${origin}/share.html`);
  assert.equal(share.headers.get('cache-control'), 'no-store');
  await share.text();
});

test('root-relative upstream assets still use authenticated connection routing', async t => {
  const { origin, cookie, calls } = await fixture(t);
  const response = await fetch(`${origin}/css/style.css?theme=dark`, {
    headers: { cookie, referer: `${origin}/connect/reports/` },
    redirect: 'manual',
  });

  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), '/connect/reports/__upstream_root__/css/style.css?theme=dark');
  await response.text();
  assert.equal(calls.get, 1);
  assert.equal(calls.touch, 1);
  assert.equal(calls.proxy, 1);
});

test('external referrers cannot turn first-party assets into proxy requests', async t => {
  const { origin, cookie, calls } = await fixture(t);
  const response = await fetch(`${origin}/css/style.css`, {
    headers: { cookie, referer: 'https://other.example/connect/reports/' },
  });

  assert.equal(response.status, 200);
  await response.text();
  assert.deepEqual(calls, { get: 0, touch: 0, proxy: 0 });
});
