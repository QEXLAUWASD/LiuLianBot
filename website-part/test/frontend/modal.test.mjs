import assert from 'node:assert/strict';
import test from 'node:test';
import { useState } from 'react';

import { Modal } from '../../frontend/src/components/Modal.jsx';
import { click, flush, press, render, setupDom } from '../support/react.mjs';

function Harness() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <>
      <nav id="siteNav"><button id="nav-action" type="button">Navigation action</button></nav>
      <main id="background">
        <button id="opener" type="button" onClick={() => setOpen(true)}>Open</button>
      </main>
      <p id="reason">{reason}</p>
      <Modal
        open={open}
        labelledBy="modalTitle"
        onClose={dismissReason => {
          setReason(dismissReason);
          setOpen(false);
        }}
      >
        <div className="modal-header">
          <h3 id="modalTitle">Example dialog</h3>
        </div>
        <button id="first" type="button">First</button>
        <button id="close" type="button" onClick={() => setOpen(false)}>Close</button>
      </Modal>
    </>
  );
}

function mount() {
  const dom = setupDom('<div id="root"></div>');
  render(<Harness />);
  return {
    dom,
    document: dom.document,
    overlay: () => dom.document.querySelector('.modal-overlay'),
  };
}

test('modals stay hidden until opened and then trap focus', async () => {
  const { dom, document, overlay } = mount();
  try {
    assert.equal(overlay().hidden, true);
    assert.equal(overlay().getAttribute('aria-modal'), 'true');
    assert.equal(overlay().getAttribute('aria-labelledby'), 'modalTitle');

    document.getElementById('opener').focus();
    click(document.getElementById('opener'));
    await flush();

    assert.equal(overlay().hidden, false);
    assert.equal(document.getElementById('siteNav').hasAttribute('inert'), true);
    assert.equal(document.getElementById('background').hasAttribute('inert'), true);
    assert.equal(document.activeElement.id, 'first');
  } finally {
    dom.cleanup();
  }
});

test('escape and backdrop clicks close the modal and restore the opener', async () => {
  const { dom, document, overlay } = mount();
  try {
    document.getElementById('opener').focus();
    click(document.getElementById('opener'));
    await flush();
    press(document, 'Escape');
    await flush();

    assert.equal(document.getElementById('reason').textContent, 'escape');
    assert.equal(overlay().hidden, true);
    assert.equal(document.getElementById('background').hasAttribute('inert'), false);
    assert.equal(document.activeElement.id, 'opener');

    click(document.getElementById('opener'));
    await flush();
    click(overlay());
    await flush();

    assert.equal(document.getElementById('reason').textContent, 'backdrop');
    assert.equal(overlay().hidden, true);
    assert.equal(document.activeElement.id, 'opener');
  } finally {
    dom.cleanup();
  }
});

test('content clicks stay inside the modal and programmatic closes restore focus', async () => {
  const { dom, document, overlay } = mount();
  try {
    document.getElementById('opener').focus();
    click(document.getElementById('opener'));
    await flush();

    click(document.getElementById('first'));
    assert.equal(overlay().hidden, false, 'clicking content must not dismiss the modal');
    assert.equal(document.getElementById('reason').textContent, '');

    click(document.getElementById('close'));
    await flush();

    assert.equal(overlay().hidden, true);
    assert.equal(document.getElementById('reason').textContent, '');
    assert.equal(document.getElementById('background').hasAttribute('inert'), false);
    assert.equal(document.activeElement.id, 'opener');
  } finally {
    dom.cleanup();
  }
});
