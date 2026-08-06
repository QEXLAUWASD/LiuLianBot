import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeChromiumPage } from '../../public/js/chromium.mjs';

function setupDocument() {
  return new JSDOM(`
    <div id="chromiumStatus"></div>
    <section id="chromiumFramePanel" hidden></section>
    <section id="chromiumSetup" hidden></section>
    <iframe id="chromiumFrame"></iframe>
    <a id="chromiumOpenLink" hidden></a>
    <span id="chromiumConnectionName"></span>
  `).window.document;
}

test('Chromium page opens only the authorized chromium connection', async () => {
  const documentRef = setupDocument();
  const connection = { slug: 'chromium', name: 'Chromium', description: 'Browser service' };

  assert.equal(await initializeChromiumPage({
    documentRef,
    request: async () => ({ connections: [connection] }),
  }), connection);
  assert.equal(documentRef.getElementById('chromiumFrame').getAttribute('src'), '/connect/chromium/');
  assert.equal(documentRef.getElementById('chromiumOpenLink').getAttribute('href'), '/connect/chromium/');
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, false);
  assert.equal(documentRef.getElementById('chromiumSetup').hidden, true);
});

test('Chromium page shows setup state when the connection is missing', async () => {
  const documentRef = setupDocument();

  assert.equal(await initializeChromiumPage({
    documentRef,
    request: async () => ({ connections: [] }),
  }), null);
  assert.equal(documentRef.getElementById('chromiumSetup').hidden, false);
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, true);
});
