const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

function freshMobileRouter(getConnectionAccessBySlug) {
  const dbPath = require.resolve('../src/db');
  const routerPath = require.resolve('../src/routes/mobile_connections');
  delete require.cache[routerPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { getConnectionAccessBySlug },
  };
  return require('../src/routes/mobile_connections');
}

function createTestApp(router, user = { id: 'user-1', username: 'mobile' }) {
  const app = express();
  app.use((req, _res, next) => {
    req.session = user ? { user } : {};
    next();
  });
  app.use('/api/mobile', router);
  return app;
}

async function requestMobileConnect(app, slug = 'reports') {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    return await fetch(`http://127.0.0.1:${port}/api/mobile/connect/${slug}`, {
      redirect: 'manual',
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('mobile connect requires an authenticated website session', async () => {
  const router = freshMobileRouter(async () => assert.fail('db must not be called'));
  const response = await requestMobileConnect(createTestApp(router, null));

  assert.equal(response.status, 401);
});

test('mobile connect returns 404 for missing or disabled website connections', async () => {
  const router = freshMobileRouter(async (slug, userId) => {
    assert.equal(slug, 'missing');
    assert.equal(userId, 'user-1');
    return null;
  });
  const response = await requestMobileConnect(createTestApp(router), 'missing');

  assert.equal(response.status, 404);
});

test('mobile connect returns 403 when the user cannot access the connection', async () => {
  const router = freshMobileRouter(async () => ({
    connection: { slug: 'reports' },
    allowed: false,
  }));
  const response = await requestMobileConnect(createTestApp(router));

  assert.equal(response.status, 403);
});

test('mobile connect redirects allowed users to the existing proxied website URL', async () => {
  const router = freshMobileRouter(async () => ({
    connection: { slug: 'reports' },
    allowed: true,
  }));
  const response = await requestMobileConnect(createTestApp(router));

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/connect/reports/');
});

test('accessible connection list query keeps hidden websites out of user-facing lists', async () => {
  const source = require('node:fs').readFileSync(
    require.resolve('../src/db/connections'),
    'utf8'
  );

  assert.match(source, /WHERE c\.enabled = 1 AND c\.hidden = 0/);
});
