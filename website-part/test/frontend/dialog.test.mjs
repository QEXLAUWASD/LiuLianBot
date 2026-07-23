import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

import { createDialog } from '../../public/js/dialog.mjs';
import { setupAdminDialogs } from '../../public/js/admin_dialogs.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(testDir, '../../public');

function createFixture({ controls = true } = {}) {
  const dom = new JSDOM(`
    <nav><button id="nav-action">Navigation action</button></nav>
    <main id="background" aria-hidden="false">
      <button id="opener">Open</button>
    </main>
    <div id="dialog" role="dialog" aria-modal="true" aria-labelledby="title" hidden>
      <h2 id="title">Example dialog</h2>
      ${controls ? '<button id="first">First</button><input id="last">' : ''}
    </div>
  `, { url: 'https://example.test/admin.html' });
  const document = dom.window.document;
  const dialog = document.getElementById('dialog');
  const background = document.getElementById('background');
  return { dom, document, dialog, background };
}

function keydown(dom, target, key, options = {}) {
  const event = new dom.window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

test('createDialog validates the dialog element and its accessible label', () => {
  const dom = new JSDOM('<div id="plain"></div>');
  const element = dom.window.document.getElementById('plain');

  assert.throws(() => createDialog(null), /element/i);
  assert.throws(() => createDialog(element), /role="dialog"/i);
  element.setAttribute('role', 'dialog');
  assert.throws(() => createDialog(element), /aria-labelledby/i);
  element.setAttribute('aria-labelledby', 'missing-title');
  assert.throws(() => createDialog(element), /label/i);
  dom.window.close();
});

test('open reveals the dialog, focuses its first control, and close restores the opener', () => {
  const { dom, document, dialog, background } = createFixture();
  const opener = document.getElementById('opener');
  const events = [];
  dialog.addEventListener('dialog:open', event => events.push(['open', event.detail.opener]));
  dialog.addEventListener('dialog:close', event => events.push(['close', event.detail.reason]));
  const controller = createDialog(dialog, { background });

  opener.focus();
  assert.equal(controller.open(opener), true);
  assert.equal(dialog.hidden, false);
  assert.equal(document.activeElement.id, 'first');
  assert.equal(background.inert, true);
  assert.equal(background.getAttribute('aria-hidden'), 'true');

  assert.equal(controller.close('saved'), true);
  assert.equal(dialog.hidden, true);
  assert.equal(document.activeElement, opener);
  assert.equal(background.inert, false);
  assert.equal(background.getAttribute('aria-hidden'), 'false');
  assert.deepEqual(events, [['open', opener], ['close', 'saved']]);
  dom.window.close();
});

test('Escape closes only an open dialog and consumes the handled event', () => {
  const { dom, document, dialog } = createFixture();
  const controller = createDialog(dialog);
  const closed = [];
  dialog.addEventListener('dialog:close', event => closed.push(event.detail.reason));

  const closedEvent = keydown(dom, dialog, 'Escape');
  assert.equal(closedEvent.defaultPrevented, false);

  controller.open(document.getElementById('opener'));
  const openEvent = keydown(dom, document.getElementById('first'), 'Escape');
  assert.equal(openEvent.defaultPrevented, true);
  assert.equal(dialog.hidden, true);
  assert.deepEqual(closed, ['escape']);
  dom.window.close();
});

test('Tab and Shift+Tab trap focus and recalculate dynamically disabled controls', () => {
  const { dom, document, dialog } = createFixture();
  const controller = createDialog(dialog);
  const first = document.getElementById('first');
  const last = document.getElementById('last');
  controller.open(document.getElementById('opener'));

  last.focus();
  assert.equal(keydown(dom, last, 'Tab').defaultPrevented, true);
  assert.equal(document.activeElement, first);

  first.focus();
  keydown(dom, first, 'Tab', { shiftKey: true });
  assert.equal(document.activeElement, last);

  first.disabled = true;
  document.getElementById('opener').focus();
  keydown(dom, document, 'Tab');
  assert.equal(document.activeElement, last);

  first.disabled = false;
  document.getElementById('opener').focus();
  keydown(dom, document, 'Tab', { shiftKey: true });
  assert.equal(document.activeElement, last);
  dom.window.close();
});

test('a dialog without controls focuses itself and removes only its temporary tabindex', () => {
  const { dom, document, dialog } = createFixture({ controls: false });
  const controller = createDialog(dialog);

  controller.open(document.getElementById('opener'));
  assert.equal(document.activeElement, dialog);
  assert.equal(dialog.getAttribute('tabindex'), '-1');
  controller.close();
  assert.equal(dialog.hasAttribute('tabindex'), false);
  dom.window.close();
});

test('close safely falls back when the opener is removed or disabled', () => {
  for (const invalidation of ['remove', 'disable']) {
    const { dom, document, dialog } = createFixture();
    const opener = document.getElementById('opener');
    const fallback = document.getElementById('nav-action');
    const controller = createDialog(dialog, { background: document.querySelectorAll('nav, main') });
    controller.open(opener);
    if (invalidation === 'remove') opener.remove();
    else opener.disabled = true;

    assert.doesNotThrow(() => controller.close());
    assert.equal(document.activeElement, fallback);
    dom.window.close();
  }
});

test('background state is restored exactly and shared dialogs do not release it early', () => {
  const dom = new JSDOM(`
    <main id="background" inert aria-hidden="menu"><button id="opener">Open</button></main>
    <div id="one" role="dialog" aria-labelledby="one-title" hidden><h2 id="one-title">One</h2><button>OK</button></div>
    <div id="two" role="dialog" aria-labelledby="two-title" hidden><h2 id="two-title">Two</h2><button>OK</button></div>
  `);
  const document = dom.window.document;
  const background = document.getElementById('background');
  background.inert = true;
  const one = createDialog(document.getElementById('one'), { background });
  const two = createDialog(document.getElementById('two'), { background });

  one.open(document.getElementById('opener'));
  two.open();
  one.close();
  assert.equal(background.inert, true);
  assert.equal(background.getAttribute('aria-hidden'), 'true');
  two.close();
  assert.equal(background.inert, true);
  assert.equal(background.getAttribute('aria-hidden'), 'menu');
  dom.window.close();
});

test('open and close are idempotent and do not duplicate lifecycle events', () => {
  const { dom, document, dialog } = createFixture();
  const controller = createDialog(dialog);
  let opens = 0;
  let closes = 0;
  dialog.addEventListener('dialog:open', () => opens += 1);
  dialog.addEventListener('dialog:close', () => closes += 1);

  assert.equal(controller.open(document.getElementById('opener')), true);
  assert.equal(controller.open(), false);
  assert.equal(controller.close(), true);
  assert.equal(controller.close(), false);
  assert.deepEqual({ opens, closes }, { opens: 1, closes: 1 });
  dom.window.close();
});

test('admin dialogs have native hidden state and complete dialog semantics', async () => {
  const html = await readFile(resolve(publicDir, 'admin.html'), 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];

  assert.deepEqual(dialogs.map(dialog => dialog.id), [
    'userEditModal',
    'groupEditModal',
    'connectionEditModal',
    'guildDetailModal',
    'confirmDialog',
  ]);
  for (const dialog of dialogs) {
    assert.equal(dialog.hidden, true, `${dialog.id} should use hidden`);
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(dialog.hasAttribute('style'), false, `${dialog.id} should not use inline display`);
    const labelId = dialog.getAttribute('aria-labelledby');
    assert.ok(labelId, `${dialog.id} needs aria-labelledby`);
    assert.equal(document.querySelectorAll(`#${labelId}`).length, 1, `${labelId} must be unique`);
    assert.ok(dialog.contains(document.getElementById(labelId)), `${labelId} must label its dialog`);
    assert.ok(dialog.querySelectorAll('[data-dialog-close]').length >= 1);
  }
  assert.equal(document.querySelectorAll('[data-dialog-close][onclick]').length, 0);
  assert.ok([...document.querySelectorAll('[data-dialog-close]')].every(button => button.type === 'button'));
  dom.window.close();
});

test('admin dialog integration wires existing helpers, close controls, and backdrop clicks', async () => {
  const [html, adminSource, css] = await Promise.all([
    readFile(resolve(publicDir, 'admin.html'), 'utf8'),
    readFile(resolve(publicDir, 'js/admin.js'), 'utf8'),
    readFile(resolve(publicDir, 'css/style.css'), 'utf8'),
  ]);
  assert.match(html, /src="\/js\/admin_dialogs\.mjs/);
  assert.match(adminSource, /adminDialogs\.open\(modalId,\s*opener\)/);
  assert.match(adminSource, /adminDialogs\.close\(modalId,\s*reason\)/);
  assert.match(adminSource, /openModal\('confirmDialog'/);
  assert.match(adminSource, /closeModal\('confirmDialog'/);
  assert.match(adminSource, /confirmDialog.*addEventListener\('dialog:close'/s);
  assert.match(css, /\[role=['"]?dialog['"]?\]\[hidden\]\s*{\s*display:\s*none/);

  const dom = new JSDOM(html, { url: 'https://example.test/admin.html' });
  const document = dom.window.document;
  const controllers = setupAdminDialogs(document);
  const opener = document.querySelector('a[href="/admin.html"]');
  controllers.open('groupEditModal', opener);
  const dialog = document.getElementById('groupEditModal');
  dialog.querySelector('[data-dialog-close]').click();
  assert.equal(dialog.hidden, true);
  assert.equal(document.activeElement, opener);

  controllers.open('groupEditModal', opener);
  dialog.querySelector('.modal').click();
  assert.equal(dialog.hidden, false, 'content click must not close the dialog');
  dialog.click();
  assert.equal(dialog.hidden, true, 'backdrop click closes the dialog');
  dom.window.close();
});
