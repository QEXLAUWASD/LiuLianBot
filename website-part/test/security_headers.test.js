const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const {
  securityHeaders,
  CONTENT_SECURITY_POLICY,
  isProxiedConnection,
} = require('../src/middleware/security_headers');
const { createRouter: createHealthRouter } = require('../src/routes/health');
const { setStaticCacheHeaders } = require('../src/app');

function responseRecorder() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
  };
}

test('security headers are applied to first-party responses', () => {
  const res = responseRecorder();
  let called = false;
  securityHeaders({ path: '/index.html' }, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.headers['content-security-policy'], CONTENT_SECURITY_POLICY);
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(res.headers['x-dns-prefetch-control'], 'off');
  assert.equal(res.headers['strict-transport-security'], undefined, 'HSTS needs TLS');
});

test('security headers skip proxied third-party websites', () => {
  for (const path of ['/connect', '/connect/demo', '/connect/demo/app.js']) {
    assert.equal(isProxiedConnection(path), true);
    const res = responseRecorder();
    let called = false;
    securityHeaders({ path }, res, () => { called = true; });
    assert.equal(called, true);
    assert.deepEqual(res.headers, {}, `${path} must keep the upstream headers`);
  }
});

test('HSTS is advertised only for secure requests', () => {
  const res = responseRecorder();
  securityHeaders({ path: '/', secure: true }, res, () => {});
  assert.match(res.headers['strict-transport-security'], /max-age=31536000/);
});

test('static cache headers fingerprint assets and revalidate HTML', () => {
  const asset = responseRecorder();
  setStaticCacheHeaders(asset, '/srv/public/assets/main-abc123.js');
  assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable');

  const html = responseRecorder();
  setStaticCacheHeaders(html, '/srv/public/index.html');
  assert.equal(html.headers['cache-control'], 'no-cache');

  const css = responseRecorder();
  setStaticCacheHeaders(css, '/srv/public/css/style.css');
  assert.equal(css.headers['cache-control'], 'no-cache');
});

test('health endpoint reports ok when the pool answers', async () => {
  const health = createHealthRouter({ getPool: async () => ({ query: async () => [[{ 1: 1 }]] }) });
  const app = express().use('/healthz', health);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('health endpoint reports 503 when the pool fails', async () => {
  const health = createHealthRouter({ getPool: async () => { throw new Error('down'); } });
  const app = express().use('/healthz', health);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable' });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
