import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');

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
