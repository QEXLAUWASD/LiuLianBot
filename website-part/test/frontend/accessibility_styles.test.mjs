import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');

test('pages expose install metadata for iPhone and iPad home screen shortcuts', async () => {
  const pageNames = ['login.html', 'index.html', 'account.html', 'roller.html', 'admin.html', 'events.html', '404.html'];

  for (const pageName of pageNames) {
    const html = await readFile(resolve(publicDir, pageName), 'utf8');
    const document = new JSDOM(html).window.document;

    assert.equal(document.querySelector('link[rel="manifest"]')?.getAttribute('href'), '/manifest.webmanifest');
    assert.equal(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'), '/img/apple-touch-icon.png');
    assert.equal(document.querySelector('meta[name="theme-color"]')?.getAttribute('content'), '#1c6ba0');
    assert.equal(document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content'), 'yes');
    assert.equal(document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content'), 'LiuLianBot');
  }

  const manifest = JSON.parse(await readFile(resolve(publicDir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'LiuLianBot');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/index.html');

  for (const icon of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
    const data = await readFile(resolve(publicDir, 'img', icon));
    assert.ok(data.length > 0, `${icon} should exist`);
  }
});

test('tab pages use shared classes and complete live-region semantics', async () => {
  for (const pageName of ['login.html', 'roller.html', 'admin.html']) {
    const html = await readFile(resolve(publicDir, pageName), 'utf8');
    const document = new JSDOM(html).window.document;
    const root = document.querySelector('[data-tabs]');

    assert.ok(root.classList.contains('tabs'), `${pageName} needs the shared tabs root`);
    assert.ok(root.querySelector('[role="tablist"].tab-list'));
    assert.ok([...root.querySelectorAll('[role="tab"]')].every(tab => tab.classList.contains('tab')));
    assert.ok([...root.querySelectorAll('[role="tabpanel"]')].every(panel => panel.classList.contains('tab-panel')));
  }

  const login = new JSDOM(await readFile(resolve(publicDir, 'login.html'), 'utf8')).window.document;
  for (const id of ['loginError', 'regError']) {
    assert.equal(login.getElementById(id).getAttribute('role'), 'alert');
    assert.equal(login.getElementById(id).getAttribute('aria-live'), 'assertive');
  }

  const adminSource = await readFile(resolve(publicDir, 'js/admin.mjs'), 'utf8');
  assert.match(adminSource, /aria-live['"]?:\s*['"]polite/);
  assert.match(adminSource, /aria-atomic['"]?:\s*['"]true/);
});

test('component CSS supports reduced motion without stale tab or select rules', async () => {
  const css = await readFile(resolve(publicDir, 'css/style.css'), 'utf8');

  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\[hidden\]\s*{\s*display:\s*none\s*!important/);
  assert.match(css, /\.tab-list\s*{/);
  assert.match(css, /\.tab\s*{/);
  assert.match(css, /\.tab-panel/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /\.(?:auth-tabs|roller-tabs|admin-tabs|tab-btn|roller-tab|admin-tab)\b/);
  assert.doesNotMatch(css, /\.form-select\b/);
});
