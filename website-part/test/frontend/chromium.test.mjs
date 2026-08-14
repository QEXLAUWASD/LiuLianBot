import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeChromiumPage, normalizeUrl } from '../../public/js/chromium.mjs';

function setupDocument() {
  return new JSDOM(`
    <form id="chromiumAddressForm">
      <input id="chromiumAddress">
      <button type="submit">Go</button>
    </form>
    <div id="chromiumStatus"></div>
    <section id="chromiumHome"></section>
    <button id="chromiumHomeButton" hidden>Home</button>
    <button id="chromiumCopyCommand">Copy</button>
    <code id="chromiumLaunchCommand"></code>
    <div class="chromium-quick-links"><a href="https://example.com/" data-chromium-url>Example</a></div>
  `, { url: 'https://www.liulian.dev/chromium.html' }).window.document;
}

test('Chromium page is ready for a native WebView', () => {
  const documentRef = setupDocument();
  const controls = initializeChromiumPage({ documentRef, navigatorRef: { clipboard: { writeText: async () => {} } } });

  assert.equal(typeof controls.prepareUrl, 'function');
  assert.equal(documentRef.getElementById('chromiumHomeButton').hidden, true);
});

test('Chromium page prepares a valid URL for WebviewJS', () => {
  const documentRef = setupDocument();
  initializeChromiumPage({ documentRef, navigatorRef: { clipboard: { writeText: async () => {} } } });
  const address = documentRef.getElementById('chromiumAddress');
  address.value = 'https://www.liulian.dev/terms.html';
  documentRef.getElementById('chromiumAddressForm').dispatchEvent(
    new documentRef.defaultView.Event('submit', { bubbles: true, cancelable: true })
  );

  assert.equal(address.value, 'https://www.liulian.dev/terms.html');
  assert.equal(documentRef.getElementById('chromiumLaunchCommand').textContent, "npm run chromium -- 'https://www.liulian.dev/terms.html'");
  assert.equal(documentRef.getElementById('chromiumHomeButton').hidden, false);
  assert.match(documentRef.getElementById('chromiumStatus').textContent, /已驗證/);
});

test('Chromium page prepares quick links in the native WebView command', () => {
  const documentRef = setupDocument();
  initializeChromiumPage({ documentRef, navigatorRef: { clipboard: { writeText: async () => {} } } });
  documentRef.querySelector('[data-chromium-url]').dispatchEvent(
    new documentRef.defaultView.MouseEvent('click', { bubbles: true, cancelable: true })
  );

  assert.equal(documentRef.getElementById('chromiumLaunchCommand').textContent, "npm run chromium -- 'https://example.com/'");
});

test('Chromium page rejects non-web URLs', () => {
  const documentRef = setupDocument();
  initializeChromiumPage({ documentRef, navigatorRef: { clipboard: { writeText: async () => {} } } });
  documentRef.getElementById('chromiumAddress').value = 'javascript:alert(1)';
  documentRef.getElementById('chromiumAddressForm').dispatchEvent(
    new documentRef.defaultView.Event('submit', { bubbles: true, cancelable: true })
  );

  assert.match(documentRef.getElementById('chromiumStatus').textContent, /只支援/);
});

test('Chromium URL normalization accepts only HTTP and HTTPS', () => {
  assert.equal(normalizeUrl('https://example.com/path'), 'https://example.com/path');
  assert.throws(() => normalizeUrl('javascript:alert(1)'), /只支援/);
});
