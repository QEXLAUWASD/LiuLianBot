import assert from 'node:assert/strict';
import test from 'node:test';

import { RemotePage, sshEndpoint } from '../../frontend/src/pages/RemotePage.jsx';
import { flush, mockFetch, render, setupDom } from '../support/react.mjs';

function mount(routes) {
  const dom = setupDom('<div id="root"></div>', { url: 'https://example.test/remote.html' });
  const fetchMock = mockFetch({
    'GET /api/remote-profile': {
      payload: {
        serverStorageAvailable: true,
        profile: { ssh: null, rdp: { host: 'legacy.example.com', port: '3389', username: 'alice' } },
        features: { ssh: true, rdp: true },
      },
    },
    'GET /api/rdp/profiles': { payload: { available: true, profiles: [{ id: 'one', name: 'Home' }] } },
    'POST /api/rdp/profiles': { payload: { id: 'two' } },
    ...routes,
  });
  render(<RemotePage socketFactory={() => ({ on() {}, once() {}, emit() {}, connect() {}, disconnect() {}, removeAllListeners() {}, connected: false })} />);
  return {
    dom,
    window: dom.window,
    document: dom.document,
    fetchMock,
    async teardown() {
      fetchMock.restore();
      dom.cleanup();
    },
  };
}

test('the remote page renders the WebRDP workspace and SSH terminal', async () => {
  const { document, teardown } = mount();
  try {
    await flush();

    const canvas = document.getElementById('rdpCanvas');
    assert.equal(canvas.tabIndex, 0);
    assert.ok(document.getElementById('rdpForm'));
    assert.ok(document.getElementById('sshForm'));
    assert.equal(document.getElementById('rdpPassword').getAttribute('autocomplete'), 'current-password');
    assert.equal(document.getElementById('rdpViewport').tabIndex, 0);
    assert.equal(document.getElementById('rdpPanel').hidden, false);
    assert.equal(document.getElementById('sshPanel').hidden, false);
    assert.equal(document.getElementById('rdpDisconnect').disabled, true);
    assert.equal(document.getElementById('sshDisconnect').disabled, true);
  } finally {
    await teardown();
  }
});

test('stored RDP profiles load into the connect form', async () => {
  const { document, window: windowRef, fetchMock, teardown } = mount({
    'GET /api/rdp/profiles/one': { payload: { profile: { id: 'one', name: 'Home', host: '192.168.0.10', port: '3389', username: 'alice', password: 'secret' } } },
  });

  try {
    await flush();

    const list = document.getElementById('rdpProfileList');
    assert.equal(list.disabled, false);
    assert.deepEqual([...list.options].map(option => option.textContent), ['新增連線設定', 'Home']);
    assert.match(document.getElementById('rdpProfileStatus').textContent, /舊版 RDP 設定|舊設定/);

    list.value = 'one';
    list.dispatchEvent(new windowRef.Event('change', { bubbles: true }));
    await flush();

    assert.equal(document.getElementById('rdpHost').value, '192.168.0.10');
    assert.equal(document.getElementById('rdpPassword').value, 'secret');
    assert.match(document.getElementById('rdpProfileStatus').textContent, /已載入設定與密碼/);
    assert.equal(fetchMock.callsTo('GET', '/api/rdp/profiles/one').length, 1);
  } finally {
    await teardown();
  }
});

test('a server without credential encryption explains the missing setup', async () => {
  const { document, teardown } = mount({
    'GET /api/rdp/profiles': { payload: { available: false, profiles: [] } },
  });

  try {
    await flush();

    assert.equal(document.getElementById('saveRdp').disabled, true);
    assert.equal(document.getElementById('rdpProfileList').disabled, true);
    assert.match(document.getElementById('rdpProfileStatus').textContent, /REMOTE_CREDENTIAL_ENCRYPTION_KEY/);
  } finally {
    await teardown();
  }
});

test('missing remote features hide the RDP and SSH panels', async () => {
  const { document, teardown } = mount({
    'GET /api/remote-profile': {
      payload: { serverStorageAvailable: false, features: { ssh: false, rdp: false }, profile: null },
    },
  });

  try {
    await flush();

    assert.equal(document.getElementById('sshPanel').hidden, true);
    assert.equal(document.getElementById('rdpPanel').hidden, true);
    assert.equal(document.getElementById('rdpConnectPanel').hidden, true);
    assert.equal(document.getElementById('sshStorage').querySelector('option[value="server"]').disabled, true);
  } finally {
    await teardown();
  }
});

test('ssh connections target the same-origin websocket', () => {
  assert.equal(sshEndpoint({ protocol: 'https:', host: 'example.test' }), 'wss://example.test/api/ssh');
  assert.equal(sshEndpoint({ protocol: 'http:', host: 'localhost:3000' }), 'ws://localhost:3000/api/ssh');
});
