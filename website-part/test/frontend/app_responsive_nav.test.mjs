import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { act } from 'react';

import { App, PAGE_LOADERS } from '../../frontend/src/App.jsx';
import { authState } from '../../frontend/src/lib/authStore.mjs';
import { click, flush, mockFetch, press, render, setupDom } from '../support/react.mjs';

before(() => PAGE_LOADERS.dashboard());

function mount() {
  authState.reset();
  const dom = setupDom();
  const previousMatchMedia = globalThis.matchMedia;
  const listeners = new Set();
  const media = {
    matches: true,
    addEventListener: (_event, handler) => listeners.add(handler),
    removeEventListener: (_event, handler) => listeners.delete(handler),
  };
  globalThis.matchMedia = () => media;
  let nextFrame = 0;
  const frames = new Map();
  globalThis.requestAnimationFrame = callback => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = frame => frames.delete(frame);
  const fetchMock = mockFetch({
    'GET /api/auth/me': { payload: { loggedIn: true, user: { username: 'alice', role: 'user' } } },
    'GET /api/page-visibility': { payload: { pages: {} } },
    'GET /api/connections': { payload: { connections: [] } },
    'GET /api/events': { payload: { events: [] } },
  });
  const mounted = render(<App page="dashboard" />);
  return {
    document: dom.document,
    flushFrames() {
      act(() => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach(callback => callback());
      });
    },
    resizeMobile(matches) {
      act(() => {
        media.matches = matches;
        [...listeners].forEach(listener => listener(media));
      });
    },
    cleanup() {
      mounted.unmount();
      assert.equal(listeners.size, 0, 'media-query listeners are removed on unmount');
      assert.equal(frames.size, 0, 'pending focus callbacks are cancelled on unmount');
      fetchMock.restore();
      if (previousMatchMedia === undefined) delete globalThis.matchMedia;
      else globalThis.matchMedia = previousMatchMedia;
      dom.cleanup();
    },
  };
}

test('resizing an open mobile drawer to desktop removes the backdrop and restores body scrolling', async () => {
  const harness = mount();
  const { document } = harness;
  try {
    await flush();
    document.body.style.overflow = 'auto';
    const toggle = document.querySelector('.topbar-toggle');
    click(toggle);
    harness.flushFrames();
    assert.equal(document.body.style.overflow, 'hidden');
    assert.ok(document.querySelector('.nav-backdrop'));
    const brand = document.querySelector('.nav-brand');
    brand.focus();

    harness.resizeMobile(false);
    harness.flushFrames();
    assert.equal(document.querySelector('.app-shell').dataset.navOpen, 'false');
    assert.equal(document.querySelector('.nav-backdrop'), null);
    assert.equal(document.body.style.overflow, 'auto');
    assert.equal(document.getElementById('siteNav').inert, false);
    assert.equal(document.activeElement, brand, 'desktop must not receive focus on the hidden mobile toggle');

    harness.resizeMobile(true);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(document.getElementById('siteNav').inert, true, 'returning to mobile keeps the drawer closed');
    assert.equal(document.body.style.overflow, 'auto');
  } finally {
    harness.cleanup();
  }
});

test('Escape restores the mobile opener, but a pending focus callback respects a desktop resize', async () => {
  const harness = mount();
  const { document } = harness;
  try {
    await flush();
    const toggle = document.querySelector('.topbar-toggle');
    click(toggle);
    harness.flushFrames();
    press(document.activeElement, 'Escape');
    harness.flushFrames();
    assert.equal(document.activeElement, toggle);

    click(toggle);
    harness.flushFrames();
    const brand = document.querySelector('.nav-brand');
    brand.focus();
    press(brand, 'Escape');
    harness.resizeMobile(false);
    harness.flushFrames();
    assert.equal(document.activeElement, brand);
    assert.equal(document.body.style.overflow, '');
  } finally {
    harness.cleanup();
  }
});
