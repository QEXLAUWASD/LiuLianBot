const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const yaml = require('js-yaml');
const { normalizeServer, normalizeSubscription, renderConfig } = require('../src/services/clash_config');
const { errorHandler } = require('../src/middleware/error_handler');
const token = 'a'.repeat(64);
const node = { name: 'Hong Kong', enabled: true, proxy_yaml: 'type: trojan\nserver: vpn.example.com\nport: 443\npassword: "a&b*c"\ntls: true\n' };
const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { findUserById: async id => ({ id, role_name: id === 'admin' ? 'admin' : 'user' }) } };
const { createRouters } = require('../src/routes/clash');

async function fixture(t) {
  let serverData = { id: 1, ...normalizeServer(node) };
  let sub = { enabled: true, expires_at: new Date(Date.now() + 60000), server_ids: [1] };
  let activeToken = token;
  let writes = 0;
  const db = {
    listServers: async () => [serverData], listSubscriptions: async () => [], listSyncStatus: async () => [],
    saveServer: async (id, data) => { writes++; serverData = { id: id || 1, ...data }; return serverData.id; },
    deleteServer: async () => { writes++; serverData = null; },
    saveSubscription: async (userId, data) => { writes++; sub = data; },
    deleteSubscription: async () => { writes++; sub = { ...sub, enabled: false, server_ids: [] }; },
    rotateToken: async () => { writes++; activeToken = 'b'.repeat(64); },
    getSubscription: async value => value === activeToken && sub.enabled && sub.expires_at > new Date()
      ? { expires_at: sub.expires_at, servers: serverData?.enabled && sub.server_ids.includes(serverData.id) ? [serverData] : [] } : null,
  };
  const routers = createRouters({ db });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = req.headers['x-user'] ? { user: { id: req.headers['x-user'] } } : {}; next(); });
  app.use('/api/admin/clash', routers.admin);
  app.use('/clash-sub', routers.subscription);
  app.use(errorHandler);
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  return { writes: () => writes,
    request: (path, method = 'GET', body, user) => fetch(`http://127.0.0.1:${listener.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': user } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  };
}

test('all Clash management endpoints require a current administrator role', async t => {
  const f = await fixture(t);
  for (const [method, path, body] of [
    ['GET', '/servers'], ['POST', '/servers', node], ['PUT', '/servers/1', node], ['DELETE', '/servers/1'],
    ['GET', '/profiles'], ['GET', '/sync-status'], ['POST', '/sync'],
    ['GET', '/subscriptions'], ['DELETE', '/subscriptions/user'], ['PUT', '/subscriptions/user', {}], ['POST', '/subscriptions/user/rotate'],
  ]) {
    assert.equal((await f.request(`/api/admin/clash${path}`, method, body)).status, 401);
    assert.equal((await f.request(`/api/admin/clash${path}`, method, body, 'user')).status, 403);
  }
  assert.equal(f.writes(), 0);
  assert.equal((await f.request('/api/admin/clash/servers', 'GET', null, 'admin')).status, 200);
});

test('subscription reflects node edits and contains only granted nodes', async t => {
  const f = await fixture(t);
  const url = `/clash-sub/${token}.yaml`;
  let response = await f.request(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('subscription-userinfo'), /^expire=\d+$/);
  let config = yaml.load(await response.text());
  assert.deepEqual(config.proxies.map(p => p.name), ['Hong Kong']);
  assert.deepEqual(config['proxy-groups'][0].proxies, ['Hong Kong']);
  assert.deepEqual(config.rules, ['MATCH,VPN']);
  assert.equal((await f.request('/api/admin/clash/servers/1', 'PUT', { ...node, name: 'Japan' }, 'admin')).status, 200);
  config = yaml.load(await (await f.request(url)).text());
  assert.equal(config.proxies[0].name, 'Japan');
  await f.request('/api/admin/clash/subscriptions/user', 'PUT', { enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [2] }, 'admin');
  response = await f.request(url);
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /password|vpn\.example/);
});

test('expired, disabled and rotated subscriptions cannot download configs', async t => {
  const f = await fixture(t);
  const url = `/clash-sub/${token}.yaml`;
  for (const data of [
    { enabled: true, expires_at: '2020-01-01T00:00:00Z', server_ids: [1] },
    { enabled: false, expires_at: '2099-01-01T00:00:00Z', server_ids: [1] },
  ]) {
    assert.equal((await f.request('/api/admin/clash/subscriptions/user', 'PUT', data, 'admin')).status, 200);
    const response = await f.request(url);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), '');
  }
  await f.request('/api/admin/clash/subscriptions/user', 'PUT', { enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [1] }, 'admin');
  await f.request('/api/admin/clash/subscriptions/user/rotate', 'POST', null, 'admin');
  assert.equal((await f.request(url)).status, 404);
  assert.equal((await f.request(`/clash-sub/${'b'.repeat(64)}.yaml`)).status, 200);
  assert.equal((await f.request('/clash-sub/not-a-token.yaml')).status, 404);
});

test('disabled and deleted nodes cannot be downloaded', async t => {
  const f = await fixture(t);
  await f.request('/api/admin/clash/servers/1', 'PUT', { ...node, enabled: false }, 'admin');
  assert.equal((await f.request(`/clash-sub/${token}.yaml`)).status, 403);
  await f.request('/api/admin/clash/servers/1', 'DELETE', null, 'admin');
  assert.equal((await f.request(`/clash-sub/${token}.yaml`)).status, 403);
});

test('validation rejects invalid proxies, aliases, cross-node references and invalid expiry', () => {
  const valid = normalizeServer(node);
  assert.equal(JSON.parse(valid.proxy_json).password, 'a&b*c');
  for (const proxy_yaml of ['[]', 'type: trojan\nserver: host\nport: 0\npassword: pass',
    'type: trojan\nserver: host\nport: 443', `${node.proxy_yaml}dialer-proxy: private-node`,
    `${node.proxy_yaml}name: hidden`, `${node.proxy_yaml}a: &loop [*loop]`,
  ]) assert.throws(() => normalizeServer({ ...node, proxy_yaml }), { statusCode: 400 });
  assert.throws(() => normalizeServer({ ...node, name: 'VPN' }), { statusCode: 400 });
  assert.throws(() => normalizeSubscription({ enabled: true, expires_at: '2099-01-01', server_ids: [] }), { statusCode: 400 });
  assert.throws(() => normalizeSubscription({ enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: ['1'] }), { statusCode: 400 });
  assert.deepEqual(normalizeSubscription({ enabled: false, expires_at: '2099-01-01T08:00:00+08:00', server_ids: [1, 1] }).server_ids, [1]);
  assert.equal(yaml.load(renderConfig([{ name: 'a: b', proxy_json: valid.proxy_json }])).proxies[0].name, 'a: b');
});


test('removing VPN subscription invalidates its download and validates user ID', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/admin/clash/subscriptions/user', 'DELETE', null, 'admin')).status, 200);
  assert.equal((await f.request(`/clash-sub/${token}.yaml`)).status, 404);
  assert.equal((await f.request('/api/admin/clash/subscriptions/bad%20id', 'DELETE', null, 'admin')).status, 400);
  assert.equal(f.writes(), 1);
});
