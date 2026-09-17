import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import { createDialog } from '../../frontend/src/lib/dialog.mjs';

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
  assert.equal(document.activeElement.id, opener.id);
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

test('stacked dialogs suspend non-top dialogs and restore LIFO focus and attributes exactly', () => {
  const dom = new JSDOM(`
    <main id="background"><button id="outside">Open A</button></main>
    <div id="a" role="dialog" aria-labelledby="a-title" aria-modal="legacy" aria-hidden="seed" inert hidden>
      <h2 id="a-title">A</h2><button id="a-action">Open B</button>
    </div>
    <div id="b" role="dialog" aria-labelledby="b-title" hidden>
      <h2 id="b-title">B</h2><button id="b-action">Close B</button>
    </div>
  `);
  const document = dom.window.document;
  const background = document.getElementById('background');
  const aElement = document.getElementById('a');
  const bElement = document.getElementById('b');
  aElement.inert = true;
  const a = createDialog(aElement, { background });
  const b = createDialog(bElement, { background });

  a.open(document.getElementById('outside'));
  assert.equal(aElement.getAttribute('aria-modal'), 'true');
  assert.equal(aElement.hasAttribute('aria-hidden'), false);
  assert.equal(aElement.inert, false);
  assert.equal(aElement.hasAttribute('inert'), false);

  document.getElementById('a-action').focus();
  b.open(document.getElementById('a-action'));
  assert.equal(aElement.getAttribute('aria-modal'), 'false');
  assert.equal(aElement.getAttribute('aria-hidden'), 'true');
  assert.equal(aElement.inert, true);
  assert.equal(bElement.getAttribute('aria-modal'), 'true');
  assert.equal(bElement.hasAttribute('aria-hidden'), false);
  assert.equal(bElement.inert, false);

  b.close();
  assert.equal(aElement.getAttribute('aria-modal'), 'true');
  assert.equal(aElement.hasAttribute('aria-hidden'), false);
  assert.equal(aElement.inert, false);
  assert.equal(document.activeElement.id, 'a-action');

  a.close();
  assert.equal(aElement.getAttribute('aria-modal'), 'legacy');
  assert.equal(aElement.getAttribute('aria-hidden'), 'seed');
  assert.equal(aElement.inert, true);
  assert.equal(aElement.hasAttribute('inert'), true);
  assert.equal(document.activeElement.id, 'outside');
  dom.window.close();
});

test('closing a middle dialog keeps the top active and later resumes the surviving dialog', () => {
  const dom = new JSDOM(`
    <main id="background"><button id="outside">Open A</button></main>
    <div id="a" role="dialog" aria-labelledby="a-title" hidden><h2 id="a-title">A</h2><button id="a-action">A action</button></div>
    <div id="b" role="dialog" aria-labelledby="b-title" hidden><h2 id="b-title">B</h2><button id="b-action">B action</button></div>
    <div id="c" role="dialog" aria-labelledby="c-title" hidden><h2 id="c-title">C</h2><button id="c-action">C action</button></div>
  `);
  const document = dom.window.document;
  const background = document.getElementById('background');
  const elements = ['a', 'b', 'c'].map(id => document.getElementById(id));
  const [a, b, c] = elements.map(element => createDialog(element, { background }));

  a.open(document.getElementById('outside'));
  b.open(document.getElementById('a-action'));
  c.open(document.getElementById('b-action'));
  b.close();
  assert.equal(document.activeElement.id, 'c-action');
  assert.deepEqual(elements.map(element => element.getAttribute('aria-modal')), ['false', null, 'true']);
  assert.deepEqual(elements.map(element => Boolean(element.inert)), [true, false, false]);

  c.close();
  assert.equal(elements[0].getAttribute('aria-modal'), 'true');
  assert.equal(elements[0].hasAttribute('aria-hidden'), false);
  assert.equal(elements[0].inert, false);
  assert.equal(document.activeElement.id, 'a-action');

  a.close();
  assert.equal(document.activeElement.id, 'outside');
  assert.equal(background.hasAttribute('inert'), false);
  dom.window.close();
});

test('closing the root dialog early still restores the stack session external opener last', () => {
  const dom = new JSDOM(`
    <main id="background"><button id="fallback">Fallback</button><button id="outside">Open A</button></main>
    <div id="a" role="dialog" aria-labelledby="a-title" hidden><h2 id="a-title">A</h2><button id="a-action">A action</button></div>
    <div id="b" role="dialog" aria-labelledby="b-title" hidden><h2 id="b-title">B</h2><button id="b-action">B action</button></div>
    <div id="c" role="dialog" aria-labelledby="c-title" hidden><h2 id="c-title">C</h2><button id="c-action">C action</button></div>
  `);
  const document = dom.window.document;
  const background = document.getElementById('background');
  const [a, b, c] = ['a', 'b', 'c']
    .map(id => createDialog(document.getElementById(id), { background }));

  a.open(document.getElementById('outside'));
  b.open(document.getElementById('a-action'));
  c.open(document.getElementById('b-action'));
  a.close();
  c.close();
  assert.equal(document.activeElement.id, 'b-action');
  b.close();
  assert.equal(document.activeElement.id, 'outside');
  dom.window.close();
});

test('root session backgrounds restore focus when the root closes before a dialog without background', () => {
  const dom = new JSDOM(`
    <main id="root-background"><button id="root-fallback">Fallback</button><button id="outside">Open A</button></main>
    <div id="a" role="dialog" aria-labelledby="a-title" hidden><h2 id="a-title">A</h2><button id="a-action">A action</button></div>
    <div id="b" role="dialog" aria-labelledby="b-title" hidden><h2 id="b-title">B</h2><button id="b-action">B action</button></div>
  `);
  const document = dom.window.document;
  const a = createDialog(document.getElementById('a'), {
    background: document.getElementById('root-background'),
  });
  const b = createDialog(document.getElementById('b'));
  const outside = document.getElementById('outside');

  a.open(outside);
  b.open(document.getElementById('a-action'));
  outside.remove();
  a.close();
  b.close();

  assert.equal(document.activeElement.id, 'root-fallback');
  assert.notEqual(document.activeElement.id, 'b-action');
  dom.window.close();
});

test('a later dialog background cannot replace the root session fallback order', () => {
  const dom = new JSDOM(`
    <main id="root-background"><button id="root-fallback">Root fallback</button><button id="outside">Open A</button></main>
    <aside id="later-background"><button id="later-fallback">Later fallback</button></aside>
    <div id="a" role="dialog" aria-labelledby="a-title" hidden><h2 id="a-title">A</h2><button id="a-action">A action</button></div>
    <div id="b" role="dialog" aria-labelledby="b-title" hidden><h2 id="b-title">B</h2><button id="b-action">B action</button></div>
  `);
  const document = dom.window.document;
  const a = createDialog(document.getElementById('a'), {
    background: document.getElementById('root-background'),
  });
  const b = createDialog(document.getElementById('b'), {
    background: document.getElementById('later-background'),
  });
  const outside = document.getElementById('outside');

  a.open(outside);
  b.open(document.getElementById('a-action'));
  outside.remove();
  b.close();
  a.close();

  assert.equal(document.activeElement.id, 'root-fallback');
  dom.window.close();
});

test('invalid session fallback controls are skipped before focusing the document body', () => {
  const dom = new JSDOM(`
    <main id="root-background"><button id="disabled" disabled>Disabled</button><button id="outside">Open</button></main>
    <div id="dialog" role="dialog" aria-labelledby="title" hidden><h2 id="title">Dialog</h2><button id="dialog-action">Action</button></div>
  `);
  const document = dom.window.document;
  const background = document.getElementById('root-background');
  const controller = createDialog(document.getElementById('dialog'), { background });
  controller.open(document.getElementById('outside'));
  document.getElementById('outside').remove();
  background.hidden = true;

  controller.close();

  assert.equal(document.activeElement, document.body);
  assert.equal(document.getElementById('dialog').hidden, true);
  assert.notEqual(document.activeElement.id, 'dialog-action');
  dom.window.close();
});

test('session fallback skips a removed background and uses the next valid background', () => {
  const dom = new JSDOM(`
    <main id="removed-background"><button id="outside">Open</button></main>
    <aside id="backup-background"><button id="backup">Backup</button></aside>
    <div id="dialog" role="dialog" aria-labelledby="title" hidden><h2 id="title">Dialog</h2><button>Action</button></div>
  `);
  const document = dom.window.document;
  const removed = document.getElementById('removed-background');
  const controller = createDialog(document.getElementById('dialog'), {
    background: [removed, document.getElementById('backup-background'), removed],
  });
  controller.open(document.getElementById('outside'));
  removed.remove();

  controller.close();

  assert.equal(document.activeElement.id, 'backup');
  dom.window.close();
});

test('programmatic focus escaping to the background or a non-top dialog returns to the top', () => {
  const dom = new JSDOM(`
    <main><button id="outside">Outside</button></main>
    <div id="a" role="dialog" aria-labelledby="a-title" hidden><h2 id="a-title">A</h2><button id="a-action">A action</button></div>
    <div id="b" role="dialog" aria-labelledby="b-title" hidden><h2 id="b-title">B</h2><button id="b-action">B action</button></div>
  `);
  const document = dom.window.document;
  const background = document.querySelector('main');
  const a = createDialog(document.getElementById('a'), { background });
  const b = createDialog(document.getElementById('b'), { background });
  a.open(document.getElementById('outside'));
  b.open(document.getElementById('a-action'));

  document.getElementById('outside').focus();
  assert.equal(document.activeElement.id, 'b-action');
  document.getElementById('a-action').focus();
  assert.equal(document.activeElement.id, 'b-action');
  dom.window.close();
});

test('nested dialog structures are rejected before an ancestor can make a child inert', () => {
  const dom = new JSDOM(`
    <div id="outer" role="dialog" aria-labelledby="outer-title" hidden>
      <h2 id="outer-title">Outer</h2><button id="outer-action">Outer action</button>
      <div id="inner" role="dialog" aria-labelledby="inner-title" hidden><h2 id="inner-title">Inner</h2><button>Inner action</button></div>
    </div>
  `);
  const document = dom.window.document;
  assert.throws(() => createDialog(document.getElementById('outer')), /nested/i);
  assert.throws(() => createDialog(document.getElementById('inner')), /nested/i);
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
