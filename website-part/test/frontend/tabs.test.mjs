import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

import { setupTabs } from '../../public/js/tabs.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(testDir, '../../public');

function createTabs(selected = 'second') {
  const dom = new JSDOM(`
    <div data-tabs>
      <div role="tablist">
        <button id="first-tab" role="tab" aria-controls="first-panel"
          aria-selected="${selected === 'first'}">First</button>
        <button id="second-tab" role="tab" aria-controls="second-panel"
          aria-selected="${selected === 'second'}">Second</button>
        <button id="third-tab" role="tab" aria-controls="third-panel" disabled
          aria-selected="${selected === 'third'}">Third</button>
      </div>
      <section id="first-panel" role="tabpanel" aria-labelledby="first-tab"></section>
      <section id="second-panel" role="tabpanel" aria-labelledby="second-tab"></section>
      <section id="third-panel" role="tabpanel" aria-labelledby="third-tab"></section>
    </div>
  `);
  return { dom, root: dom.window.document.querySelector('[data-tabs]') };
}

test('setupTabs normalizes selection, roving tabindex, panels, and visual classes', () => {
  const { dom, root } = createTabs('second');
  setupTabs(root);

  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = [...root.querySelectorAll('[role="tabpanel"]')];
  assert.deepEqual(tabs.map(tab => tab.getAttribute('aria-selected')), ['false', 'true', 'false']);
  assert.deepEqual(tabs.map(tab => tab.tabIndex), [-1, 0, -1]);
  assert.deepEqual(panels.map(panel => panel.hidden), [true, false, true]);
  assert.deepEqual(tabs.map(tab => tab.classList.contains('active')), [false, true, false]);
  assert.deepEqual(panels.map(panel => panel.classList.contains('active')), [false, true, false]);
  dom.window.close();
});

test('missing or ambiguous initial selection falls back to the first enabled tab', () => {
  for (const selected of ['none', 'first']) {
    const { dom, root } = createTabs(selected);
    if (selected === 'first') {
      root.querySelector('#second-tab').setAttribute('aria-selected', 'true');
    }
    setupTabs(root);
    assert.equal(root.querySelector('#first-tab').getAttribute('aria-selected'), 'true');
    assert.equal(root.querySelector('#first-panel').hidden, false);
    dom.window.close();
  }
});

test('initializing an outer root does not collect or mutate a nested tabs root', () => {
  const dom = new JSDOM(`
    <div id="outer" data-tabs>
      <button id="outer-one-tab" role="tab" aria-controls="outer-one" aria-selected="true">Outer one</button>
      <button id="outer-two-tab" role="tab" aria-controls="outer-two" aria-selected="false">Outer two</button>
      <section id="outer-one" role="tabpanel" data-tabs>
        <button id="inner-one-tab" role="tab" aria-controls="inner-one" aria-selected="false" tabindex="-1">Inner one</button>
        <button id="inner-two-tab" role="tab" aria-controls="inner-two" aria-selected="true" tabindex="0">Inner two</button>
        <section id="inner-one" role="tabpanel" hidden></section>
        <section id="inner-two" role="tabpanel"></section>
      </section>
      <section id="outer-two" role="tabpanel" hidden></section>
    </div>
  `);
  const document = dom.window.document;
  setupTabs(document.getElementById('outer'));

  assert.equal(document.getElementById('inner-one-tab').getAttribute('aria-selected'), 'false');
  assert.equal(document.getElementById('inner-one').hidden, true);
  assert.equal(document.getElementById('inner-two-tab').getAttribute('aria-selected'), 'true');
  assert.equal(document.getElementById('inner-two').hidden, false);
  dom.window.close();
});

test('nested roots remain independent when both are initialized', () => {
  const dom = new JSDOM(`
    <div id="outer" data-tabs>
      <button id="outer-one-tab" role="tab" aria-controls="outer-one" aria-selected="true">Outer one</button>
      <button id="outer-two-tab" role="tab" aria-controls="outer-two" aria-selected="false">Outer two</button>
      <section id="outer-one" role="tabpanel" data-tabs>
        <button id="inner-one-tab" role="tab" aria-controls="inner-one" aria-selected="true">Inner one</button>
        <button id="inner-two-tab" role="tab" aria-controls="inner-two" aria-selected="false">Inner two</button>
        <section id="inner-one" role="tabpanel"></section>
        <section id="inner-two" role="tabpanel" hidden></section>
      </section>
      <section id="outer-two" role="tabpanel" hidden></section>
    </div>
  `);
  const document = dom.window.document;
  const outer = document.getElementById('outer');
  const inner = document.getElementById('outer-one');
  setupTabs(outer);
  setupTabs(inner);

  document.getElementById('inner-two-tab').click();
  assert.equal(document.getElementById('outer-one-tab').getAttribute('aria-selected'), 'true');
  document.getElementById('outer-two-tab').click();
  assert.equal(document.getElementById('inner-two-tab').getAttribute('aria-selected'), 'true');
  assert.equal(document.getElementById('inner-two').hidden, false);
  dom.window.close();
});

test('an outer tab cannot resolve its panel from a nested root', () => {
  const dom = new JSDOM(`
    <div id="outer" data-tabs>
      <button role="tab" aria-controls="shared-panel" aria-selected="true">Outer</button>
      <div data-tabs>
        <section id="shared-panel" role="tabpanel"></section>
      </div>
    </div>
  `);
  assert.throws(
    () => setupTabs(dom.window.document.getElementById('outer')),
    /setupTabs: panel #shared-panel/,
  );
  dom.window.close();
});

test('setupTabs is idempotent for the same root', () => {
  const { dom, root } = createTabs('first');
  let changes = 0;
  root.addEventListener('tabs:change', () => { changes += 1; });
  const first = setupTabs(root);
  const second = setupTabs(root);

  assert.equal(second, first);
  root.querySelector('#second-tab').click();
  assert.equal(changes, 1);
  dom.window.close();
});

test('click activates and focuses a tab and dispatches a useful change event', () => {
  const { dom, root } = createTabs('first');
  const changes = [];
  root.addEventListener('tabs:change', event => changes.push(event.detail));
  setupTabs(root);

  const second = root.querySelector('#second-tab');
  second.click();
  assert.equal(dom.window.document.activeElement, second);
  assert.equal(second.getAttribute('aria-selected'), 'true');
  assert.equal(root.querySelector('#second-panel').hidden, false);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].tab, second);
  assert.equal(changes[0].panel.id, 'second-panel');
  dom.window.close();
});

test('arrow, Home, and End keys wrap through enabled tabs and prevent default', () => {
  const { dom, root } = createTabs('first');
  setupTabs(root);
  const first = root.querySelector('#first-tab');
  const second = root.querySelector('#second-tab');

  const left = new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
  first.dispatchEvent(left);
  assert.equal(left.defaultPrevented, true);
  assert.equal(dom.window.document.activeElement, second);

  const right = new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  second.dispatchEvent(right);
  assert.equal(right.defaultPrevented, true);
  assert.equal(dom.window.document.activeElement, first);

  second.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
  assert.equal(dom.window.document.activeElement, first);
  first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
  assert.equal(dom.window.document.activeElement, second);
  dom.window.close();
});

test('navigation and activation use the current disabled state', () => {
  const { dom, root } = createTabs('first');
  const controller = setupTabs(root);
  const first = root.querySelector('#first-tab');
  const second = root.querySelector('#second-tab');
  const third = root.querySelector('#third-tab');

  second.setAttribute('aria-disabled', 'true');
  first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert.equal(dom.window.document.activeElement, first);
  assert.equal(controller.activate(second), false);

  second.removeAttribute('aria-disabled');
  third.disabled = false;
  first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  assert.equal(dom.window.document.activeElement, third);

  third.disabled = true;
  third.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  assert.equal(dom.window.document.activeElement, second);
  dom.window.close();
});

test('activating the selected tab focuses without dispatching another change', () => {
  const { dom, root } = createTabs('first');
  let changes = 0;
  root.addEventListener('tabs:change', () => { changes += 1; });
  const controller = setupTabs(root);
  const first = root.querySelector('#first-tab');

  assert.equal(controller.activate(first), true);
  first.click();
  assert.equal(dom.window.document.activeElement, first);
  assert.equal(changes, 0);
  dom.window.close();
});

test('Space and Enter rely on native button clicks without keydown activation', () => {
  const { dom, root } = createTabs('first');
  let changes = 0;
  root.addEventListener('tabs:change', () => { changes += 1; });
  setupTabs(root);

  const second = root.querySelector('#second-tab');
  for (const key of [' ', 'Enter']) {
    const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    second.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(changes, 0);
  second.click();
  assert.equal(changes, 1);
  dom.window.close();
});

test('empty roots are harmless and malformed tab relationships throw developer errors', () => {
  assert.doesNotThrow(() => setupTabs(null));
  const empty = new JSDOM('<div data-tabs></div>');
  assert.doesNotThrow(() => setupTabs(empty.window.document.querySelector('[data-tabs]')));
  empty.window.close();

  for (const html of [
    '<div data-tabs><button role="tab">Broken</button></div>',
    '<div data-tabs><button role="tab" aria-controls="missing">Broken</button></div>',
  ]) {
    const dom = new JSDOM(html);
    assert.throws(
      () => setupTabs(dom.window.document.querySelector('[data-tabs]')),
      /setupTabs: tab .*aria-controls|setupTabs: panel/,
    );
    dom.window.close();
  }
});

test('login, roller, and admin expose complete tab and panel semantics', async () => {
  for (const filename of ['login.html', 'roller.html', 'admin.html']) {
    const html = await readFile(resolve(publicDir, filename), 'utf8');
    const dom = new JSDOM(html);
    const root = dom.window.document.querySelector('[data-tabs]');
    assert.ok(root, `${filename} needs a data-tabs root`);
    assert.ok(root.querySelector('[role="tablist"]'), `${filename} needs a tablist`);

    const tabs = [...root.querySelectorAll('[role="tab"]')];
    assert.ok(tabs.length >= 2);
    assert.equal(tabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length, 1);
    for (const tab of tabs) {
      assert.ok(tab.id);
      const panel = root.querySelector(`#${tab.getAttribute('aria-controls')}`);
      assert.ok(panel, `${filename}: ${tab.id} needs a controlled panel`);
      assert.equal(panel.getAttribute('role'), 'tabpanel');
      assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
      assert.equal(panel.hidden, tab.getAttribute('aria-selected') !== 'true');
    }
    dom.window.close();
  }
});

test('page entries are modules, use setupTabs, and leave no legacy script references or duplicate tab click logic', async () => {
  const pages = {
    'login.html': 'auth.mjs',
    'roller.html': 'roller.mjs',
    'admin.html': 'admin.mjs',
  };

  for (const [page, entry] of Object.entries(pages)) {
    const html = await readFile(resolve(publicDir, page), 'utf8');
    assert.match(html, new RegExp(`<script[^>]+type="module"[^>]+src="/js/${entry.replace('.', '\\.')}`));
    assert.doesNotMatch(html, /\/js\/(?:auth|roller)\.js/);

    const source = await readFile(resolve(publicDir, 'js', entry), 'utf8');
    assert.match(source, /import\s*\{\s*setupTabs\s*\}\s*from\s*['"]\.\/tabs\.mjs['"]/);
    assert.doesNotMatch(source, /querySelectorAll\([^)]*tab-btn[^)]*\)[\s\S]{0,300}addEventListener\(['"]click/);
  }

  const adminSource = await readFile(resolve(publicDir, 'js/admin.mjs'), 'utf8');
  assert.doesNotMatch(adminSource, /Tab Switching|\.admin-tabs[\s\S]{0,500}addEventListener\(['"]click/);
  assert.match(adminSource, /loadUsers|tabs:change/);
});

test('admin tab bootstrap preserves initial and selected-tab data loading', async () => {
  const html = await readFile(resolve(publicDir, 'admin.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.test/admin.html' });
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.fetch = async url => {
    calls.push(String(url));
    const key = String(url).split('/').at(-1);
    return new Response(JSON.stringify({ [key]: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await import(`../../public/js/admin.mjs?test=${Date.now()}`);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls, ['/api/admin/users']);

    dom.window.document.getElementById('groups-tab').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls, ['/api/admin/users', '/api/admin/groups']);
    dom.window.document.getElementById('groups-tab').click();
    assert.deepEqual(calls, ['/api/admin/users', '/api/admin/groups']);

    const inner = dom.window.document.createElement('div');
    inner.setAttribute('data-tabs', '');
    inner.innerHTML = `
      <button id="inner-users-tab" role="tab" data-tab="users" aria-controls="inner-users" aria-selected="true">Inner users</button>
      <button id="inner-groups-tab" role="tab" data-tab="groups" aria-controls="inner-groups" aria-selected="false">Inner groups</button>
      <section id="inner-users" role="tabpanel"></section>
      <section id="inner-groups" role="tabpanel" hidden></section>
    `;
    dom.window.document.getElementById('usersTab').append(inner);
    setupTabs(inner);
    dom.window.document.getElementById('inner-groups-tab').click();
    assert.deepEqual(calls, ['/api/admin/users', '/api/admin/groups']);

    dom.window.document.querySelector('.admin-container').dispatchEvent(new dom.window.CustomEvent('tabs:change', {
      detail: {
        tab: dom.window.document.getElementById('inner-groups-tab'),
        panel: dom.window.document.getElementById('inner-groups'),
      },
    }));
    assert.deepEqual(calls, ['/api/admin/users', '/api/admin/groups']);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
