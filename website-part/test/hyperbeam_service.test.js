const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HyperbeamApiError,
  createHyperbeamSession,
  normalizeStartUrl,
} = require('../src/services/hyperbeam');

test('validates Hyperbeam start URLs', () => {
  assert.equal(normalizeStartUrl(' https://example.com/ '), 'https://example.com/');
  assert.throws(() => normalizeStartUrl('javascript:alert(1)'), HyperbeamApiError);
  assert.throws(() => normalizeStartUrl(''), /required/);
});

test('requires a server-side API key', async () => {
  await assert.rejects(
    createHyperbeamSession({ startUrl: 'https://example.com/', env: {}, fetchImpl: () => {} }),
    error => error instanceof HyperbeamApiError && error.statusCode === 503
  );
});

test('creates a Hyperbeam session with the expected request', async () => {
  let request;
  const result = await createHyperbeamSession({
    startUrl: 'https://example.com/',
    env: { HYPERBEAM_API_KEY: 'secret', HYPERBEAM_REGION: 'us' },
    fetchImpl: async (...args) => {
      request = args;
      return {
        ok: true,
        json: async () => ({ session_id: 'session-1', embed_url: 'https://embed.example', admin_token: 'token-1' }),
      };
    },
  });

  assert.deepEqual(result, {
    sessionId: 'session-1',
    embedUrl: 'https://embed.example',
    adminToken: 'token-1',
  });
  assert.equal(request[0], 'https://engine.hyperbeam.com/v0/vm');
  assert.equal(request[1].method, 'POST');
  assert.equal(request[1].headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(request[1].body), {
    start_url: 'https://example.com/',
    kiosk: true,
    region: 'US',
    width: 1280,
    height: 720,
    timeout: { inactive: 3600, absolute: 14400, offline: 300 },
  });
});

test('maps upstream and malformed responses to API errors', async () => {
  await assert.rejects(
    createHyperbeamSession({
      startUrl: 'https://example.com/',
      env: { HYPERBEAM_API_KEY: 'secret' },
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'bad key' }) }),
    }),
    error => error.statusCode === 502 && error.message === 'bad key'
  );
  await assert.rejects(
    createHyperbeamSession({
      startUrl: 'https://example.com/',
      env: { HYPERBEAM_API_KEY: 'secret' },
      fetchImpl: async () => ({ ok: true, json: async () => ({ session_id: 'missing-url' }) }),
    }),
    error => error.statusCode === 502 && /invalid session/.test(error.message)
  );
});
