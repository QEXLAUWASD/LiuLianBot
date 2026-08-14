const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const chromium = require('../src/routes/chromium');
const { HyperbeamApiError } = require('../src/services/hyperbeam');

async function createServer(authenticated, createSession) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = authenticated ? { user: { id: 'user-1' } } : {};
    next();
  });
  app.use('/api/chromium', chromium.createChromiumRouter({ createSession }));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  return {
    server,
    request: body => fetch(`http://127.0.0.1:${server.address().port}/api/chromium/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  };
}

test('Chromium session API requires login', async t => {
  const fixture = await createServer(false, async () => assert.fail('must not create session'));
  t.after(() => new Promise(resolve => fixture.server.close(resolve)));
  assert.equal((await fixture.request({ start_url: 'https://example.com/' })).status, 401);
});

test('Chromium session API forwards the URL and returns the session', async t => {
  let received;
  const fixture = await createServer(true, async args => {
    received = args;
    return { sessionId: 'session-1', embedUrl: 'https://embed.example', adminToken: 'token-1' };
  });
  t.after(() => new Promise(resolve => fixture.server.close(resolve)));
  const response = await fixture.request({ start_url: 'https://example.com/' });
  assert.equal(response.status, 201);
  assert.deepEqual(received, { startUrl: 'https://example.com/' });
  assert.deepEqual(await response.json(), {
    sessionId: 'session-1', embedUrl: 'https://embed.example', adminToken: 'token-1',
  });
});

test('Chromium session API maps service errors', async t => {
  const fixture = await createServer(true, async () => {
    throw new HyperbeamApiError('invalid URL', 400);
  });
  t.after(() => new Promise(resolve => fixture.server.close(resolve)));
  const response = await fixture.request({ start_url: 'javascript:alert(1)' });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid URL' });
});
