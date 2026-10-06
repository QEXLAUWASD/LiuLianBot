import assert from 'node:assert/strict';
import test from 'node:test';
import { ClashAdmin } from '../../frontend/src/components/ClashAdmin.jsx';
import { click, flush, mockFetch, render, setupDom, selectOption, typeInto } from '../support/react.mjs';

function mount() {
  const dom = setupDom('<div id="root"></div>');
  const fetchMock = mockFetch({
    'GET /api/admin/clash/rulesets': { rulesets: [{ id: 'all-vpn', name: 'All traffic via VPN', description: 'All VPN' }, { id: 'lan-direct', name: 'LAN direct, others via VPN', description: 'LAN direct' }, { id: 'custom', name: 'Custom rule set', description: 'Custom' }] },
    'GET /api/admin/clash/profiles': { profiles: [] },
    'GET /api/admin/clash/sync-status': { servers: [] },
    'GET /api/admin/clash/servers': { servers: [{ id: 1, name: 'HK', enabled: true, proxy_yaml: 'type: trojan\nserver: host\nport: 443\npassword: test\n' }] },
    'GET /api/admin/clash/subscriptions': { subscriptions: [{ user_id: 'user-1', username: 'alice', enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [1], path: `/clash-sub/${'a'.repeat(64)}.yaml` }] },
    'DELETE /api/admin/clash/subscriptions/user-1': { success: true },
    'POST /api/admin/clash/subscriptions': { user_id: 'vpn-new' },
    'PUT /api/admin/clash/subscriptions/user-1': { success: true },
    'PUT /api/admin/clash/servers/1': { success: true },
  });
  const view = render(<ClashAdmin askConfirm={(title, body, action) => action()} />);
  return { document: dom.document, fetchMock, cleanup: () => { view.unmount(); fetchMock.restore(); dom.cleanup(); } };
}

test('Clash admin edits node YAML and saves changes to the management API', async () => {
  const f = mount();
  try {
    await flush();
    click(f.document.querySelector('tbody button'));
    typeInto(f.document.getElementById('vpn-name'), 'Japan');
    click(f.document.querySelector('form button[type="submit"]'));
    await flush();
    const calls = f.fetchMock.callsTo('PUT', '/api/admin/clash/servers/1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.name, 'Japan');
    assert.equal(calls[0].body.enabled, true);
    assert.match(calls[0].body.proxy_yaml, /password: test/);
  } finally { f.cleanup(); }
});

test('Clash admin preserves grants and converts UTC+8 expiry to UTC', async () => {
  const f = mount();
  try {
    await flush();
    click(f.document.querySelector('#clash-users-title').closest('section').querySelector('tbody button'));
    assert.equal(f.document.getElementById('vpn-user').value, 'alice');
    typeInto(f.document.getElementById('vpn-user'), 'alice VPN');
    assert.equal(f.document.getElementById('vpn-expiry').value, '2099-01-01T08:00');
    typeInto(f.document.getElementById('vpn-expiry'), '2099-02-01T12:30');
    click(f.document.querySelector('form').querySelector('button[type="submit"]'));
    await flush();
    assert.deepEqual(f.fetchMock.callsTo('PUT', '/api/admin/clash/subscriptions/user-1')[0].body, {
      username: 'alice VPN', ruleset_id: 'all-vpn', enabled: true, expires_at: '2099-02-01T04:30:00.000Z', server_ids: [1],
    });
    assert.ok(f.document.querySelector('input[readonly]').value.includes('/clash-sub/'));
  } finally { f.cleanup(); }
});


test('Clash creates independent VPN users by name without fetching website users; Cancel does not save', async () => {
  const f = mount();
  try {
    await flush();
    assert.equal(f.document.querySelectorAll('form').length, 0);
    const section = f.document.getElementById('clash-users-title').closest('section');
    assert.deepEqual([...section.querySelectorAll('tbody button')].map(button => button.textContent), ['Edit', 'Remove']);
    click(section.querySelector('.clash-list-header button'));
    const user = f.document.getElementById('vpn-user');
    assert.equal(user.tagName, 'INPUT');
    typeInto(user, 'VPN customer');
    typeInto(f.document.getElementById('vpn-expiry'), '2099-02-01T12:30');
    click([...section.querySelectorAll('form button')].find(button => button.textContent === 'Cancel'));
    assert.equal(f.document.querySelectorAll('form').length, 0);
    assert.equal(f.fetchMock.callsTo('POST', '/api/admin/clash/subscriptions').length, 0);
    click(section.querySelector('.clash-list-header button'));
    typeInto(f.document.getElementById('vpn-user'), 'VPN customer');
    typeInto(f.document.getElementById('vpn-expiry'), '2099-02-01T12:30');
    click(section.querySelector('form button[type="submit"]'));
    await flush();
    assert.equal(f.fetchMock.callsTo('POST', '/api/admin/clash/subscriptions').length, 1);
    assert.equal(f.document.querySelectorAll('form').length, 0);
    assert.equal(f.fetchMock.callsTo('GET', '/api/admin/users').length, 0);
    assert.equal(f.fetchMock.callsTo('POST', '/api/admin/clash/subscriptions')[0].body.username, 'VPN customer');
  } finally { f.cleanup(); }
});

test('Remove VPN user calls subscription deletion rather than website account deletion', async () => {
  const f = mount();
  try {
    await flush();
    click(f.document.getElementById('clash-users-title').closest('section').querySelector('tbody button.btn-danger'));
    await flush();
    assert.equal(f.fetchMock.callsTo('DELETE', '/api/admin/clash/subscriptions/user-1').length, 1);
    assert.equal(f.fetchMock.callsTo('DELETE', '/api/admin/users/user-1').length, 0);
  } finally { f.cleanup(); }
});


test('Clash rule set selector loads per-user routing and persists a changed selection', async () => {
  const f = mount();
  try {
    await flush();
    click(f.document.getElementById('clash-users-title').closest('section').querySelector('tbody button'));
    assert.equal(f.document.getElementById('vpn-ruleset').value, 'all-vpn');
    selectOption(f.document.getElementById('vpn-ruleset'), 'lan-direct');
    assert.ok(f.document.querySelector('form').textContent.includes('LAN direct'));
    click(f.document.querySelector('form button[type="submit"]'));
    await flush();
    assert.equal(f.fetchMock.callsTo('PUT', '/api/admin/clash/subscriptions/user-1')[0].body.ruleset_id, 'lan-direct');
  } finally { f.cleanup(); }
});


test('custom editor keeps a draft when switching presets and submits routing YAML', async () => {
  const f = mount();
  try {
    await flush();
    click(f.document.getElementById('clash-users-title').closest('section').querySelector('tbody button'));
    selectOption(f.document.getElementById('vpn-ruleset'), 'custom');
    const draft = 'rules:\n  - DOMAIN-SUFFIX,example.org,DIRECT\n';
    typeInto(f.document.getElementById('vpn-custom-rules'), draft);
    selectOption(f.document.getElementById('vpn-ruleset'), 'lan-direct');
    assert.equal(f.document.getElementById('vpn-custom-rules'), null);
    selectOption(f.document.getElementById('vpn-ruleset'), 'custom');
    assert.equal(f.document.getElementById('vpn-custom-rules').value, draft);
    click(f.document.querySelector('form button[type="submit"]'));
    await flush();
    const body = f.fetchMock.callsTo('PUT', '/api/admin/clash/subscriptions/user-1')[0].body;
    assert.equal(body.ruleset_id, 'custom');
    assert.equal(body.custom_rules_yaml, draft);
  } finally { f.cleanup(); }
});
