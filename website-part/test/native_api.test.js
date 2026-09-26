const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const { createOpenApi } = require('../src/services/openapi');
const { apiCatalog } = require('../src/services/api_catalog');

async function request(router, path, user = null) {
  const app = express();
  app.use((req, _res, next) => { req.session = user ? { user } : {}; next(); });
  app.use(router);
  const server = app.listen(0);
  try { const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`); return { status: r.status, body: await r.json() }; }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function mobile(db) {
  const key = require.resolve('../src/db');
  require.cache[key] = { id: key, filename: key, loaded: true, exports: db };
  delete require.cache[require.resolve('../src/routes/mobile_connections')];
  return require('../src/routes/mobile_connections');
}
test('API discovery is public and contains HTTP and realtime contracts', async () => {
  const router = mobile({ getConnectionAccessBySlug: () => assert.fail('no account lookup for discovery') });
  const r = await request(router, '/capabilities');
  assert.equal(r.status, 200);
  assert.equal(r.body.apiVersion, 1);
  assert.ok(r.body.http.files.some(item => item.path === '/api/files/shared/archive-all'));
  assert.deepEqual(r.body.realtime.rdp.bitmapFormats, ['protocol', 'rgba']);
  const spec = await request(router, '/openapi');
  assert.equal(spec.body.openapi, '3.0.3');
  assert.ok(spec.body.paths['/api/admin/users/{id}'].put.requestBody);
});
test('native connection metadata remains authenticated and does not expose upstream credentials', async () => {
  let calls = 0;
  const router = mobile({ getConnectionAccessBySlug: async () => { calls++; return { allowed: true, connection: { id: 1, slug: 'reports', name: 'Reports', target_url: 'https://internal.example/private' } }; } });
  assert.equal((await request(router, '/connections/reports')).status, 401);
  assert.equal(calls, 0);
  const result = await request(router, '/connections/reports', { id: 'user' });
  assert.equal(result.status, 200);
  assert.equal(result.body.connection.path, '/connect/reports/');
  assert.equal(result.body.connection.nativeIntegration, null);
  assert.equal(result.body.connection.target_url, undefined);
});
test('native connection metadata preserves denied and missing responses', async () => {
  assert.equal((await request(mobile({ getConnectionAccessBySlug: async () => null }), '/connections/missing', { id: 'user' })).status, 404);
  assert.equal((await request(mobile({ getConnectionAccessBySlug: async () => ({ allowed: false }) }), '/connections/denied', { id: 'user' })).status, 403);
});
test('OpenAPI snapshot is current and every declared HTTP operation has a contract', () => {
  const spec = createOpenApi();
  assert.deepEqual(JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../../docs/openapi.json'))), spec);
  for (const operations of Object.values(apiCatalog.http)) for (const { method, path } of operations) assert.ok(spec.paths[path.replace(/:([A-Za-z]+)/g, '{$1}')][method.toLowerCase()]);
  assert.equal(createOpenApi('custom-session').components.securitySchemes.session.name, 'custom-session');
  assert.equal(spec.paths['/api/files/upload'].put.requestBody.content['application/octet-stream'].schema.format, 'binary');
});
test('terms document returns the same version and sections used by the website', async () => {
  // Auth only reads the DB when an authenticated mutation is called.
  const authPath = require.resolve('../src/routes/auth'); delete require.cache[authPath];
  const router = require('../src/routes/auth');
  const result = await request(router, '/terms-document');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, require('../../shared/website/terms.json'));
  assert.equal(result.body.sections.length, 4);
});
test('Chromium keyboard accepts bounded modifier bits for native shortcuts', async () => {
  const { dispatchInput } = require('../src/services/chromium');
  const calls = [];
  const cdp = { send: async (...args) => calls.push(args) };
  await dispatchInput(cdp, { type: 'key', eventType: 'keyDown', key: 'a', modifiers: 2 }, { width: 1280, height: 720 });
  assert.equal(calls[0][1].modifiers, 2);
  await assert.rejects(dispatchInput(cdp, { type: 'key', eventType: 'keyDown', modifiers: 16 }, { width: 1280, height: 720 }), /modifiers/);
});
