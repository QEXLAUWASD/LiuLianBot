import assert from 'node:assert/strict';
import test from 'node:test';

import { Modal } from '../../frontend/src/components/Modal.jsx';
import { NavBar } from '../../frontend/src/components/NavBar.jsx';
import { Toasts } from '../../frontend/src/components/Toasts.jsx';
import { usePageVisibility } from '../../frontend/src/hooks/usePageVisibility.mjs';
import { authState } from '../../frontend/src/lib/authStore.mjs';
import { click, flush, mockFetch, press, render, setupDom } from '../support/react.mjs';

function setupNav({ connections = { payload: { connections: [] } }, mobile = false } = {}) {
  authState.reset();
  const dom = setupDom();
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} });
  const fetchMock = mockFetch({
    'GET /api/auth/me': { payload: { loggedIn: true, user: { username: 'alice', role: 'admin', remoteAvailable: false } } },
    'GET /api/page-visibility': { payload: { pages: { remote: true, chromium: true, 'vless-tunnel': true } } },
    'GET /api/connections': connections,
  });
  const mounted = render(<NavBar mobileOpen={mobile} />);
  return {
    document: dom.document,
    fetchMock,
    cleanup() {
      mounted.unmount();
      fetchMock.restore();
      if (previousMatchMedia === undefined) delete globalThis.matchMedia;
      else globalThis.matchMedia = previousMatchMedia;
      dom.cleanup();
    },
  };
}

test('navigation menu keyboard movement skips unavailable links and Escape restores its own toggle', async () => {
  const { document, cleanup } = setupNav();
  try {
    await flush();
    const toggle = document.querySelector('[aria-controls="workspaceMenu"]');
    toggle.focus();
    press(toggle, 'ArrowDown');

    const chromium = document.querySelector('a[href="/chromium.html"]');
    const tunnel = document.querySelector('a[href="/vless-tunnel.html"]');
    assert.equal(document.activeElement, chromium, 'the disabled remote workspace is skipped');
    press(chromium, 'ArrowUp');
    assert.equal(document.activeElement, tunnel, 'arrow navigation wraps');
    press(tunnel, 'Home');
    assert.equal(document.activeElement, chromium);
    press(chromium, 'End');
    assert.equal(document.activeElement, tunnel);

    let escapedToPage = false;
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') escapedToPage = true;
    });
    press(tunnel, 'Escape');
    assert.equal(document.getElementById('workspaceMenu').hidden, true);
    assert.equal(document.activeElement, toggle);
    assert.equal(escapedToPage, false, 'closing the menu must not also dismiss the mobile drawer');

    const manage = document.querySelector('[aria-controls="manageMenu"]');
    manage.focus();
    press(manage, 'ArrowUp');
    assert.equal(document.activeElement.getAttribute('href'), '/admin.html');
    press(document.activeElement, 'Escape');
    assert.equal(document.activeElement, manage);
  } finally {
    cleanup();
  }
});

test('the mobile focus trap excludes CSS-hidden controls and collapsed menu descendants', async () => {
  const { document, cleanup } = setupNav({ mobile: true });
  try {
    const style = document.createElement('style');
    style.textContent = '.sidebar-collapse { display: none; }';
    document.head.append(style);
    await flush();

    const last = document.getElementById('logoutBtn');
    const first = document.querySelector('.skip-link');
    last.focus();
    press(last, 'Tab');
    assert.equal(document.activeElement, first, 'Tab wraps before the hidden collapse button');
    press(first, 'Tab', { shiftKey: true });
    assert.equal(document.activeElement, last);

    // Hide the footer to make the last visible disclosure the end of the trap.
    document.querySelector('.sidebar-foot').hidden = true;
    const manage = document.querySelector('[aria-controls="manageMenu"]');
    manage.focus();
    press(manage, 'Tab');
    assert.equal(document.activeElement, first, 'hidden menu links are excluded even when their own hidden property is false');
  } finally {
    cleanup();
  }
});

test('failed website lists can be retried without a page reload', async () => {
  let attempts = 0;
  const { document, fetchMock, cleanup } = setupNav({
    connections: () => {
      attempts += 1;
      return attempts === 1
        ? { status: 503, payload: { error: 'Temporarily unavailable' } }
        : { payload: { connections: [{ slug: 'grafana', name: 'Grafana' }] } };
    },
  });
  try {
    await flush();
    click(document.querySelector('[aria-controls="websiteDropdownMenu"]'));
    await flush();
    const retry = document.querySelector('#websiteDropdownMenu button');
    assert.equal(retry.textContent, 'Retry');
    click(retry);
    await flush();
    assert.equal(fetchMock.callsTo('GET', '/api/connections').length, 2);
    assert.equal(document.querySelector('#websiteDropdownMenu a').getAttribute('href'), '/connect/grafana/');
  } finally {
    cleanup();
  }
});

test('a slow website lookup does not steal focus after the user has moved on', async () => {
  let resolveConnections;
  const { document, cleanup } = setupNav({
    connections: () => new Promise(resolve => { resolveConnections = resolve; }),
  });
  try {
    await flush();
    const toggle = document.querySelector('[aria-controls="websiteDropdownMenu"]');
    toggle.focus();
    press(toggle, 'ArrowDown');
    const account = document.getElementById('navUsername');
    account.focus();
    resolveConnections({ payload: { connections: [{ slug: 'grafana', name: 'Grafana' }] } });
    await flush();
    assert.equal(document.activeElement, account);
    toggle.focus();
    press(toggle, 'ArrowDown');
    assert.equal(document.activeElement.getAttribute('href'), '/connect/grafana/');
  } finally {
    cleanup();
  }
});

function Visibility({ label }) {
  const pages = usePageVisibility();
  return <output aria-label={label}>{pages ? String(pages.events) : 'loading'}</output>;
}

test('visibility consumers share in-flight work and later mounts read fresh permissions', async () => {
  const dom = setupDom();
  let resolveFirst;
  let calls = 0;
  const fetchMock = mockFetch({
    'GET /api/page-visibility': () => {
      calls += 1;
      if (calls === 1) return new Promise(resolve => { resolveFirst = resolve; });
      return { payload: { pages: { events: false } } };
    },
  });
  const mounted = render(<><Visibility label="navigation" /><Visibility label="dashboard" /></>);
  try {
    assert.equal(fetchMock.callsTo('GET', '/api/page-visibility').length, 1);
    resolveFirst({ payload: { pages: { events: true } } });
    await flush();
    assert.deepEqual([...dom.document.querySelectorAll('output')].map(node => node.textContent), ['true', 'true']);

    mounted.rerender(<Visibility key="new-session" label="new session" />);
    await flush();
    assert.equal(fetchMock.callsTo('GET', '/api/page-visibility').length, 2);
    assert.equal(dom.document.querySelector('output').textContent, 'false');
  } finally {
    mounted.unmount();
    fetchMock.restore();
    dom.cleanup();
  }
});

test('modals make the entire app shell inert, including the top bar, and restore it on close', () => {
  const dom = setupDom();
  const content = open => (
    <div className="app-shell">
      <nav>Navigation</nav>
      <header><button type="button">Toggle navigation</button></header>
      <main>Page content</main>
      <Modal open={open} labelledBy="review-title">
        <h2 id="review-title">Review dialog</h2>
        <button type="button">Dialog action</button>
      </Modal>
    </div>
  );
  const mounted = render(content(true));
  try {
    const shell = dom.document.querySelector('.app-shell');
    const overlay = dom.document.querySelector('[role="dialog"]');
    assert.equal(shell.hasAttribute('inert'), true);
    assert.equal(shell.getAttribute('aria-hidden'), 'true');
    assert.equal(overlay.closest('[inert]'), null, 'the portal remains interactive');
    mounted.rerender(content(false));
    assert.equal(shell.hasAttribute('inert'), false);
    assert.equal(shell.hasAttribute('aria-hidden'), false);
  } finally {
    mounted.unmount();
    dom.cleanup();
  }
});

test('notifications have a stack, error announcements and keyboard-accessible dismissal', () => {
  const dom = setupDom();
  const dismissed = [];
  const mounted = render(<Toasts toasts={[
    { id: 1, message: 'Saved', type: 'success' },
    { id: 2, message: 'Update failed', type: 'error' },
  ]} onDismiss={id => dismissed.push(id)} />);
  try {
    assert.equal(dom.document.querySelectorAll('.toast-stack > .toast').length, 2);
    assert.equal(dom.document.querySelector('[role="alert"] span').textContent, 'Update failed');
    const close = dom.document.querySelector('button[aria-label="Dismiss notification"]');
    assert.equal(close.tabIndex, 0);
    click(close);
    assert.deepEqual(dismissed, [1]);
  } finally {
    mounted.unmount();
    dom.cleanup();
  }
});
