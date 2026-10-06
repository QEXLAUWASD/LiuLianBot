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
    saveSubscription: async (userId, data) => { writes++; sub = data; return userId || 'vpn-new'; },
    deleteSubscription: async () => { writes++; sub = { ...sub, enabled: false, server_ids: [] }; },
    rotateToken: async () => { writes++; activeToken = 'b'.repeat(64); },
    getSubscription: async value => value === activeToken && sub.enabled && sub.expires_at > new Date()
      ? { expires_at: sub.expires_at, ruleset_id: sub.ruleset_id, custom_rules_yaml: sub.custom_rules_yaml, servers: serverData?.enabled && sub.server_ids.includes(serverData.id) ? [serverData] : [] } : null,
  };
  const routers = createRouters({ db });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = req.headers['x-user'] ? { user: { id: req.headers['x-user'] } } : {}; next(); });
  app.use('/api/admin/clash', routers.admin);
  app.use('/clash-sub-public', routers.subscription);
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
    ['GET', '/rulesets'], ['GET', '/profiles'], ['GET', '/sync-status'], ['POST', '/sync'],
    ['GET', '/subscriptions'], ['POST', '/subscriptions', {}], ['DELETE', '/subscriptions/user'], ['PUT', '/subscriptions/user', {}], ['POST', '/subscriptions/user/rotate'],
  ]) {
    assert.equal((await f.request(`/api/admin/clash${path}`, method, body)).status, 401);
    assert.equal((await f.request(`/api/admin/clash${path}`, method, body, 'user')).status, 403);
  }
  assert.equal(f.writes(), 0);
  assert.equal((await f.request('/api/admin/clash/servers', 'GET', null, 'admin')).status, 200);
});

test('subscription reflects node edits and contains only granted nodes', async t => {
  const f = await fixture(t);
  const url = `/clash-sub-public/${token}.yaml`;
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
  const url = `/clash-sub-public/${token}.yaml`;
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
  assert.equal((await f.request(`/clash-sub-public/${'b'.repeat(64)}.yaml`)).status, 200);
  assert.equal((await f.request('/clash-sub-public/not-a-token.yaml')).status, 404);
});

test('disabled and deleted nodes cannot be downloaded', async t => {
  const f = await fixture(t);
  await f.request('/api/admin/clash/servers/1', 'PUT', { ...node, enabled: false }, 'admin');
  assert.equal((await f.request(`/clash-sub-public/${token}.yaml`)).status, 403);
  await f.request('/api/admin/clash/servers/1', 'DELETE', null, 'admin');
  assert.equal((await f.request(`/clash-sub-public/${token}.yaml`)).status, 403);
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
  assert.equal((await f.request(`/clash-sub-public/${token}.yaml`)).status, 404);
  assert.equal((await f.request('/api/admin/clash/subscriptions/bad%20id', 'DELETE', null, 'admin')).status, 400);
  assert.equal(f.writes(), 1);
});

test('admin creates an independent VPN user; names are validated for create and rename', async t => {
  const f = await fixture(t);
  const data = { username: 'VPN customer', enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [1] };
  const response = await f.request('/api/admin/clash/subscriptions', 'POST', data, 'admin');
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { user_id: 'vpn-new' });
  for (const username of ['', '   ', 'x'.repeat(101), 'bad\nname']) {
    assert.equal((await f.request('/api/admin/clash/subscriptions', 'POST', { ...data, username }, 'admin')).status, 400);
    assert.equal((await f.request('/api/admin/clash/subscriptions/vpn-new', 'PUT', { ...data, username }, 'admin')).status, 400);
  }
  assert.equal((await f.request('/api/admin/clash/subscriptions', 'POST', { ...data, username: undefined }, 'admin')).status, 400);
  assert.equal(f.writes(), 1);
});


test('rule set selection changes downloaded routing without broadening granted nodes', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/admin/clash/rulesets', 'GET', null, 'admin');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rulesets.length, 5);
  const data = { enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [1], ruleset_id: 'cn-direct-adblock' };
  assert.equal((await f.request('/api/admin/clash/subscriptions/user', 'PUT', data, 'admin')).status, 200);
  const config = yaml.load(await (await f.request(`/clash-sub-public/${token}.yaml`)).text());
  assert.deepEqual(config.proxies.map(proxy => proxy.name), ['Hong Kong']);
  assert.ok(config.rules.includes('RULE-SET,llb-reject,REJECT'));
  assert.ok(config.rules.includes('RULE-SET,llb-direct,DIRECT'));
  assert.equal(config.rules.at(-1), 'MATCH,VPN');
  assert.equal((await f.request('/api/admin/clash/subscriptions/user', 'PUT', { ...data, ruleset_id: 'unknown' }, 'admin')).status, 400);
});


test('custom rules publish in order with only granted proxies and reject unknown policies/providers', async t => {
  const f = await fixture(t);
  const data = { enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [1], ruleset_id: 'custom', custom_rules_yaml: 'rules:\n  - DOMAIN-SUFFIX,example.com,DIRECT\n  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve\n' };
  assert.equal((await f.request('/api/admin/clash/subscriptions/user', 'PUT', data, 'admin')).status, 200);
  const config = yaml.load(await (await f.request(`/clash-sub-public/${token}.yaml`)).text());
  assert.deepEqual(config.rules, ['DOMAIN-SUFFIX,example.com,DIRECT', 'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve', 'MATCH,VPN']);
  assert.deepEqual(config.proxies.map(proxy => proxy.name), ['Hong Kong']);
  for (const custom_rules_yaml of ['rules: ["DOMAIN,x,Other VPN"]', 'rules: ["RULE-SET,missing,VPN"]', 'rules: ["MATCH,VPN"]\nproxies: []', 'bad yaml: [']) {
    assert.equal((await f.request('/api/admin/clash/subscriptions/user', 'PUT', { ...data, custom_rules_yaml }, 'admin')).status, 400);
  }
});
