import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { LoginPage } from '../../frontend/src/pages/LoginPage.jsx';
import { flush, mockFetch, render, setupDom } from '../support/react.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(testDir, '../../frontend');
const staticDir = resolve(frontendDir, 'static');

// Pages are built from `frontend/*.html`; the npm build copies them and the
// static assets into `public/`.
const PAGES = [
  ['index.html', 'dashboard'],
  ['login.html', 'login'],
  ['account.html', 'account'],
  ['roller.html', 'roller'],
  ['events.html', 'events'],
  ['guild-manager.html', 'guild-manager'],
  ['admin.html', 'admin'],
  ['remote.html', 'remote'],
  ['chromium.html', 'chromium'],
  ['vless-tunnel.html', 'vless-tunnel'],
  ['files.html', 'files'],
  ['share.html', 'share'],
  ['404.html', '404'],
  ['terms.html', 'terms'],
];

test('page entries mount the React bundle and keep install metadata', async () => {
  for (const [pageName, pageKey] of PAGES) {
    const html = await readFile(resolve(frontendDir, pageName), 'utf8');
    const document = new JSDOM(html).window.document;

    assert.ok(document.getElementById('root'), `${pageName} needs the React root`);
    assert.equal(
      document.querySelector('script[type="module"]')?.getAttribute('src'),
      '/src/main.jsx',
      `${pageName} must load the shared React entry`,
    );
    assert.equal(document.body.getAttribute('data-page'), pageKey);
    assert.match(document.querySelector('link[rel="stylesheet"]').getAttribute('href'), /^\/css\/style\.css/);
  }

  for (const [pageName, withInstallMetadata] of [
    ['index.html', true],
    ['login.html', true],
    ['account.html', true],
    ['roller.html', true],
    ['admin.html', true],
    ['events.html', true],
    ['chromium.html', true],
    ['404.html', true],
    ['remote.html', true],
    ['guild-manager.html', true],
    ['vless-tunnel.html', true],
    ['files.html', true],
    ['share.html', false],
    ['terms.html', false],
  ]) {
    const document = new JSDOM(await readFile(resolve(frontendDir, pageName), 'utf8')).window.document;
    if (!withInstallMetadata) continue;
    assert.equal(document.querySelector('link[rel="manifest"]')?.getAttribute('href'), '/manifest.webmanifest');
    assert.equal(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'), '/img/apple-touch-icon.png');
    assert.equal(document.querySelector('meta[name="theme-color"]')?.getAttribute('content'), '#1c6ba0');
    assert.equal(document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content'), 'yes');
    assert.equal(document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content'), 'LiuLianBot');
  }

  const manifest = JSON.parse(await readFile(resolve(staticDir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'LiuLianBot');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/index.html');

  for (const icon of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
    const data = await readFile(resolve(staticDir, 'img', icon));
    assert.ok(data.length > 0, `${icon} should exist`);
  }
});

test('the remote page keeps the vendored RDP and Socket.IO assets', async () => {
  const document = new JSDOM(await readFile(resolve(frontendDir, 'remote.html'), 'utf8')).window.document;
  const sources = [...document.querySelectorAll('script[src]')].map(script => script.getAttribute('src'));

  assert.equal(sources.includes('/vendor/socket.io.min.js'), true);
  assert.equal(sources.includes('/vendor/webrdp/rle.js'), true);
  assert.equal(
    readFileSync(resolve(staticDir, 'vendor/webrdp/NOTICE.txt'), 'utf8').length > 0,
    true,
  );
});

test('login errors keep assertive live-region semantics', async () => {
  const dom = setupDom();
  const fetchMock = mockFetch({
    'GET /api/auth/terms-status': { payload: { required: true } },
  });

  try {
    render(<LoginPage />);
    await flush();

    for (const id of ['loginError', 'regError']) {
      const region = dom.document.getElementById(id);
      assert.equal(region.getAttribute('role'), 'alert');
      assert.equal(region.getAttribute('aria-live'), 'assertive');
    }

    // Tab pages share the same classes as the previous implementation.
    const root = dom.document.querySelector('.auth-card');
    assert.equal(root.classList.contains('tabs'), true);
    assert.ok(root.querySelector('[role="tablist"].tab-list'));
    assert.ok([...root.querySelectorAll('[role="tab"]')].every(tab => tab.classList.contains('tab')));
    assert.ok([...root.querySelectorAll('[role="tabpanel"]')].every(panel => panel.classList.contains('tab-panel')));
  } finally {
    fetchMock.restore();
    dom.cleanup();
  }
});

test('component CSS still supports reduced motion without stale tab rules', async () => {
  const css = await readFile(resolve(staticDir, 'css/style.css'), 'utf8');

  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\[hidden\]\s*{\s*display:\s*none\s*!important/);
  assert.match(css, /\.tab-list\s*{/);
  assert.match(css, /\.tab\s*{/);
  assert.match(css, /\.tab-panel/);
  assert.match(css, /#root\s*{\s*display:\s*contents/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /\.(?:auth-tabs|roller-tabs|admin-tabs|tab-btn|roller-tab|admin-tab)\b/);
  assert.doesNotMatch(css, /\.form-select\b/);
});
