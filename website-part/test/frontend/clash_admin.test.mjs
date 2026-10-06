import assert from 'node:assert/strict';
import test from 'node:test';
import { ClashAdmin } from '../../frontend/src/components/ClashAdmin.jsx';
import { click, flush, mockFetch, render, setupDom, selectOption, typeInto } from '../support/react.mjs';

function mount() {
  const dom = setupDom('<div id="root"></div>');
  const fetchMock = mockFetch({
    'GET /api/admin/clash/profiles': { profiles: [] },
    'GET /api/admin/clash/sync-status': { servers: [] },
    'GET /api/admin/users': { users: [{ id: 'user-1', username: 'alice' }] },
    'GET /api/admin/clash/servers': { servers: [{ id: 1, name: 'HK', enabled: true, proxy_yaml: 'type: trojan\nserver: host\nport: 443\npassword: test\n' }] },
    'GET /api/admin/clash/subscriptions': { subscriptions: [{ user_id: 'user-1', username: 'alice', enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [1], path: `/clash-sub/${'a'.repeat(64)}.yaml` }] },
    'PUT /api/admin/clash/subscriptions/user-1': { success: true },
    'PUT /api/admin/clash/servers/1': { success: true },
  });
  const view = render(<ClashAdmin askConfirm={() => {}} />);
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
    selectOption(f.document.getElementById('vpn-user'), 'user-1');
    assert.equal(f.document.getElementById('vpn-expiry').value, '2099-01-01T08:00');
    typeInto(f.document.getElementById('vpn-expiry'), '2099-02-01T12:30');
    click(f.document.querySelectorAll('form')[1].querySelector('button[type="submit"]'));
    await flush();
    assert.deepEqual(f.fetchMock.callsTo('PUT', '/api/admin/clash/subscriptions/user-1')[0].body, {
      enabled: true, expires_at: '2099-02-01T04:30:00.000Z', server_ids: [1],
    });
    assert.ok(f.document.querySelector('input[readonly]').value.includes('/clash-sub/'));
  } finally { f.cleanup(); }
});
