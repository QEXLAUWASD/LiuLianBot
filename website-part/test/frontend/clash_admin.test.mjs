import assert from 'node:assert/strict';
import test from 'node:test';
import { ClashAdmin } from '../../frontend/src/components/ClashAdmin.jsx';
import { click, flush, mockFetch, render, setupDom, selectOption, typeInto } from '../support/react.mjs';

function mount() {
  const dom = setupDom('<div id="root"></div>');
  const fetchMock = mockFetch({
    'GET /api/admin/clash/profiles': { profiles: [] },
    'GET /api/admin/clash/sync-status': { servers: [] },
    'GET /api/admin/users': { users: [{ id: 'user-1', username: 'alice' }, { id: 'user-2', username: 'bob' }] },
    'GET /api/admin/clash/servers': { servers: [{ id: 1, name: 'HK', enabled: true, proxy_yaml: 'type: trojan\nserver: host\nport: 443\npassword: test\n' }] },
    'GET /api/admin/clash/subscriptions': { subscriptions: [{ user_id: 'user-1', username: 'alice', enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [1], path: `/clash-sub/${'a'.repeat(64)}.yaml` }] },
    'DELETE /api/admin/clash/subscriptions/user-1': { success: true },
    'PUT /api/admin/clash/subscriptions/user-2': { success: true },
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
    assert.equal(f.document.getElementById('vpn-user').disabled, true);
    assert.equal(f.document.getElementById('vpn-expiry').value, '2099-01-01T08:00');
    typeInto(f.document.getElementById('vpn-expiry'), '2099-02-01T12:30');
    click(f.document.querySelector('form').querySelector('button[type="submit"]'));
    await flush();
    assert.deepEqual(f.fetchMock.callsTo('PUT', '/api/admin/clash/subscriptions/user-1')[0].body, {
      enabled: true, expires_at: '2099-02-01T04:30:00.000Z', server_ids: [1],
    });
    assert.ok(f.document.querySelector('input[readonly]').value.includes('/clash-sub/'));
  } finally { f.cleanup(); }
});


test('Clash lists hide editors until Add; new users exclude existing subscriptions and Cancel does not save', async () => {
  const f = mount();
  try {
    await flush();
    assert.equal(f.document.querySelectorAll('form').length, 0);
    const section = f.document.getElementById('clash-users-title').closest('section');
    assert.deepEqual([...section.querySelectorAll('tbody button')].map(button => button.textContent), ['Edit', 'Remove']);
    click(section.querySelector('.clash-list-header button'));
    const user = f.document.getElementById('vpn-user');
    assert.deepEqual([...user.options].map(option => option.value), ['', 'user-2']);
    selectOption(user, 'user-2');
    typeInto(f.document.getElementById('vpn-expiry'), '2099-02-01T12:30');
    click([...section.querySelectorAll('form button')].find(button => button.textContent === 'Cancel'));
    assert.equal(f.document.querySelectorAll('form').length, 0);
    assert.equal(f.fetchMock.callsTo('PUT', '/api/admin/clash/subscriptions/user-2').length, 0);
    click(section.querySelector('.clash-list-header button'));
    selectOption(f.document.getElementById('vpn-user'), 'user-2');
    typeInto(f.document.getElementById('vpn-expiry'), '2099-02-01T12:30');
    click(section.querySelector('form button[type="submit"]'));
    await flush();
    assert.equal(f.fetchMock.callsTo('PUT', '/api/admin/clash/subscriptions/user-2').length, 1);
    assert.equal(f.document.querySelectorAll('form').length, 0);
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
