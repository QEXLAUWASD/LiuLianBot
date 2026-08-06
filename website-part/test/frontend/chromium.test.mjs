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
  `, { url: 'https://www.liulian.dev/chromium.html' }).window.document;
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
  address.value = 'https://www.liulian.dev/terms.html';
  documentRef.getElementById('chromiumAddressForm').dispatchEvent(
    new documentRef.defaultView.Event('submit', { bubbles: true, cancelable: true })
  );

  assert.equal(documentRef.getElementById('chromiumFrame').getAttribute('src'), 'https://www.liulian.dev/terms.html');
  assert.equal(documentRef.getElementById('chromiumOpenLink').getAttribute('href'), 'https://www.liulian.dev/terms.html');
  assert.equal(documentRef.getElementById('chromiumHome').hidden, true);
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, false);
});

test('Chromium page sends external websites to a new tab instead of an iframe', () => {
  const documentRef = setupDocument();
  initializeChromiumPage({ documentRef });
  documentRef.getElementById('chromiumAddress').value = 'https://www.google.com/';
  documentRef.getElementById('chromiumAddressForm').dispatchEvent(
    new documentRef.defaultView.Event('submit', { bubbles: true, cancelable: true })
  );

  assert.equal(documentRef.getElementById('chromiumFrame').getAttribute('src'), null);
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, true);
  assert.equal(documentRef.getElementById('chromiumOpenLink').getAttribute('href'), 'https://www.google.com/');
  assert.match(documentRef.getElementById('chromiumStatus').textContent, /新分頁/);
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
