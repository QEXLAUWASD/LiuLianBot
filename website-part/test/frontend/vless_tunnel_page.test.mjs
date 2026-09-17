import assert from 'node:assert/strict';
import test from 'node:test';

import { VLESS_STORAGE_KEY, VlessTunnelPage, savedSources } from '../../frontend/src/pages/VlessTunnelPage.jsx';
import { click, flush, mockFetch, render, setupDom, typeInto } from '../support/react.mjs';

const RESULT = {
  config: 'vless://uuid@example.com:443#interim',
  interim: {
    name: 'interim-node',
    internalTarget: '10.0.0.5:443',
    expiresAt: '2026-07-24T12:30:00.000Z',
  },
};

function mount(routes = {}) {
  const dom = setupDom('<div id="root"></div>', { url: 'https://example.test/vless-tunnel.html' });
  const fetchMock = mockFetch({
    'POST /api/vless-tunnel/generate': { payload: RESULT },
    ...routes,
  });
  render(<VlessTunnelPage />);
  return { dom, document: dom.document, fetchMock };
}

test('generating merges the pasted configuration and enables copying', async () => {
  const { dom, document, fetchMock } = mount();
  try {
    typeInto(document.getElementById('vlessSource'), 'vless://uuid@example.com:443#existing');
    click(document.getElementById('generateTunnel'));
    await flush();

    const requests = fetchMock.callsTo('POST', '/api/vless-tunnel/generate');
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].body, {
      format: 'vless',
      source: 'vless://uuid@example.com:443#existing',
    });

    assert.equal(document.getElementById('mergedOutput').value, RESULT.config);
    assert.equal(document.getElementById('copyOutput').disabled, false);
    assert.equal(document.getElementById('resultMeta').hidden, false);
    assert.match(document.getElementById('resultMeta').textContent, /interim-node/);
    assert.match(document.getElementById('tunnelStatus').textContent, /已完成合併/);
  } finally {
    dom.cleanup();
  }
});

test('an empty source is rejected before any request', async () => {
  const { dom, document, fetchMock } = mount();
  try {
    click(document.getElementById('generateTunnel'));
    await flush();

    assert.equal(fetchMock.callsTo('POST', '/api/vless-tunnel/generate').length, 0);
    assert.equal(document.getElementById('tunnelStatus').textContent, '請先貼上原有設定。');
  } finally {
    dom.cleanup();
  }
});

test('sources are stored per format in the browser only', async () => {
  const { dom, document } = mount();
  try {
    typeInto(document.getElementById('clashSourceTab') ? document.getElementById('vlessSource') : document.getElementById('vlessSource'), 'vless://stored');
    click(document.getElementById('saveSource'));
    assert.deepEqual(savedSources(dom.window.localStorage), { vless: 'vless://stored' });
    assert.match(document.getElementById('storageStatus').textContent, /已儲存於此瀏覽器/);

    click(document.getElementById('clashSourceTab'));
    typeInto(document.getElementById('clashSource'), 'proxies: []');
    click(document.getElementById('saveSource'));
    assert.deepEqual(savedSources(dom.window.localStorage), {
      vless: 'vless://stored',
      clash: 'proxies: []',
    });

    click(document.getElementById('clearSource'));
    assert.deepEqual(savedSources(dom.window.localStorage), { vless: 'vless://stored' });
    assert.equal(document.getElementById('clashSource').value, '');
  } finally {
    dom.cleanup();
  }
});

test('stored sources are restored on the next visit', async () => {
  const dom = setupDom('<div id="root"></div>', { url: 'https://example.test/vless-tunnel.html' });
  dom.window.localStorage.setItem(VLESS_STORAGE_KEY, JSON.stringify({ vless: 'vless://saved' }));
  render(<VlessTunnelPage />);

  try {
    assert.equal(dom.document.getElementById('vlessSource').value, 'vless://saved');
    assert.match(dom.document.getElementById('storageStatus').textContent, /已載入此瀏覽器的已儲存設定/);
  } finally {
    dom.cleanup();
  }
});

test('copying falls back to selecting the output when the clipboard is blocked', async () => {
  const { dom, document } = mount();
  const copied = [];
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: { writeText: async value => copied.push(value) },
    configurable: true,
  });

  try {
    typeInto(document.getElementById('vlessSource'), 'vless://source');
    click(document.getElementById('generateTunnel'));
    await flush();
    click(document.getElementById('copyOutput'));
    await flush();

    assert.deepEqual(copied, [RESULT.config]);
    assert.match(document.getElementById('tunnelStatus').textContent, /已複製合併結果/);
  } finally {
    dom.cleanup();
  }
});
