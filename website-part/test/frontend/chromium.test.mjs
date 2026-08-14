import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeChromiumPage, normalizeUrl } from '../../public/js/chromium.mjs';

function setupDocument() {
  return new JSDOM(`
    <form id="chromiumAddressForm"><input id="chromiumAddress"><button type="submit">Go</button></form>
    <div id="chromiumStatus"></div><section id="chromiumHome"></section>
    <button id="chromiumHomeButton" hidden>Home</button><section id="chromiumFramePanel" hidden></section>
    <div id="chromiumFrame"></div><a id="chromiumOpenLink" hidden></a>
    <div class="chromium-quick-links"><a href="https://example.com/">Example</a></div>
  `, { url: 'https://www.liulian.dev/chromium.html' }).window.document;
}

test('normalizes only http and https URLs', () => {
  assert.equal(normalizeUrl(' https://example.com/path '), 'https://example.com/path');
  assert.throws(() => normalizeUrl('javascript:alert(1)'), /只支援/);
  assert.throws(() => normalizeUrl(''), /請輸入網址/);
});

test('creates a Hyperbeam session and mounts the client', async () => {
  const documentRef = setupDocument();
  const requests = [];
  const destroyed = [];
  const client = async (container, embedUrl, options) => {
    assert.equal(container.id, 'chromiumFrame');
    assert.equal(embedUrl, 'https://embed.hyperbeam.example/session');
    assert.equal(options.adminToken, 'admin-token');
    return { destroy: () => destroyed.push(true) };
  };
  const controls = initializeChromiumPage({
    documentRef,
    HyperbeamClient: client,
    request: async (path, options) => {
      requests.push({ path, options });
      return { embedUrl: 'https://embed.hyperbeam.example/session', adminToken: 'admin-token' };
    },
  });

  const result = await controls.openUrl('https://example.com/');
  assert.equal(result, 'https://example.com/');
  assert.deepEqual(requests[0], {
    path: '/api/chromium/session',
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_url: 'https://example.com/' }),
    },
  });
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, false);
  assert.match(documentRef.getElementById('chromiumStatus').textContent, /已連線/);

  controls.destroySession();
  assert.deepEqual(destroyed, [true]);
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, true);
});

test('shows API errors and does not leave the workspace open', async () => {
  const documentRef = setupDocument();
  const controls = initializeChromiumPage({
    documentRef,
    request: async () => { throw new Error('Hyperbeam is not configured'); },
    HyperbeamClient: async () => ({ destroy() {} }),
  });

  assert.equal(await controls.openUrl('https://example.com/'), null);
  assert.match(documentRef.getElementById('chromiumStatus').textContent, /not configured/);
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, true);
});
