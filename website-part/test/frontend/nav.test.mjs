import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { renderNavbar } from '../../public/js/nav.mjs';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');

test('navbar renders stable navigation and authentication hooks', () => {
  const dom = new JSDOM('<nav id="siteNav"></nav>', { url: 'https://example.test/roller.html' });
  const originalDocument = globalThis.document;
  globalThis.document = dom.window.document;

  try {
    const refs = renderNavbar(document.getElementById('siteNav'), dom.window.location);

    assert.equal(document.querySelector('a[href="/index.html"]').textContent, 'Home');
    assert.equal(document.querySelector('a[href="/roller.html"]').classList.contains('active'), true);
    assert.ok(document.querySelector('[data-admin-only]'));
    assert.ok(document.querySelector('[data-logout]'));
    assert.ok(document.querySelector('#websiteDropdownMenu[role="menu"]'));
    assert.equal(refs.user.id, 'navUser');
    assert.equal(refs.logout.hidden, true);
    assert.equal(refs.login.hidden, true);
  } finally {
    globalThis.document = originalDocument;
    dom.window.close();
  }
});

test('navbar does not parse hostile labels as markup', () => {
  const dom = new JSDOM('<nav id="siteNav"></nav>');
  const originalDocument = globalThis.document;
  globalThis.document = dom.window.document;

  try {
    const refs = renderNavbar(document.getElementById('siteNav'));
    const hostile = '<img src=x onerror=alert(1)>';
    refs.username.textContent = hostile;

    assert.equal(refs.username.textContent, hostile);
    assert.equal(document.querySelector('img'), null);
  } finally {
    globalThis.document = originalDocument;
    dom.window.close();
  }
});

test('English pages share one empty navbar mount and safe app rendering', async () => {
  const pageNames = ['index.html', 'account.html', 'roller.html', 'admin.html', 'login.html', '404.html'];
  for (const pageName of pageNames) {
    const html = await readFile(resolve(publicDir, pageName), 'utf8');
    const dom = new JSDOM(html);
    assert.equal(dom.window.document.documentElement.lang, 'en', `${pageName} should declare English`);

    if (!['login.html', '404.html'].includes(pageName)) {
      const nav = dom.window.document.getElementById('siteNav');
      assert.ok(nav, `${pageName} should provide the shared navbar mount`);
      assert.equal(nav.childElementCount, 0, `${pageName} should not duplicate navbar children`);
    }
    dom.window.close();
  }

  const appSource = await readFile(resolve(publicDir, 'js/app.mjs'), 'utf8');
  assert.match(appSource, /renderNavbar/);
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(appSource, /escapeHTML/);
});
