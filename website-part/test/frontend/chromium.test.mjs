import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeChromiumPage } from '../../public/js/chromium.mjs';

function setupDocument() {
  return new JSDOM(`
    <form id="chromiumAddressForm">
      <input id="chromiumAddress">
      <button type="submit">Go</button>
    </form>
    <div id="chromiumStatus"></div>
    <section id="chromiumHome"></section>
    <button id="chromiumHomeButton" hidden>Home</button>
    <section id="chromiumFramePanel" hidden></section>
    <iframe id="chromiumFrame"></iframe>
    <a id="chromiumOpenLink" hidden></a>
    <div class="chromium-quick-links"><a href="https://example.com/">Example</a></div>
  `).window.document;
}

test('Chromium page is ready without a website connection', () => {
  const documentRef = setupDocument();
  const controls = initializeChromiumPage({ documentRef });

  assert.equal(typeof controls.openUrl, 'function');
  assert.equal(documentRef.getElementById('chromiumStatus').textContent, 'Chromium 已就緒。');
  assert.equal(documentRef.getElementById('chromiumHome').hidden, false);
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, true);
});

test('Chromium page opens a valid URL in the built-in workspace', () => {
  const documentRef = setupDocument();
  initializeChromiumPage({ documentRef });
  const address = documentRef.getElementById('chromiumAddress');
  address.value = 'https://example.com/path';
  documentRef.getElementById('chromiumAddressForm').dispatchEvent(
    new documentRef.defaultView.Event('submit', { bubbles: true, cancelable: true })
  );

  assert.equal(documentRef.getElementById('chromiumFrame').getAttribute('src'), 'https://example.com/path');
  assert.equal(documentRef.getElementById('chromiumOpenLink').getAttribute('href'), 'https://example.com/path');
  assert.equal(documentRef.getElementById('chromiumHome').hidden, true);
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, false);
});

test('Chromium page rejects non-web URLs', () => {
  const documentRef = setupDocument();
  initializeChromiumPage({ documentRef });
  documentRef.getElementById('chromiumAddress').value = 'javascript:alert(1)';
  documentRef.getElementById('chromiumAddressForm').dispatchEvent(
    new documentRef.defaultView.Event('submit', { bubbles: true, cancelable: true })
  );

  assert.match(documentRef.getElementById('chromiumStatus').textContent, /只支援/);
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, true);
});
