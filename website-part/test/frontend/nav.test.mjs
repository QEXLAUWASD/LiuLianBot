import assert from 'node:assert/strict';
import test from 'node:test';

import { NavBar } from '../../frontend/src/components/NavBar.jsx';
import { authState } from '../../frontend/src/lib/authStore.mjs';
import { click, flush, mockFetch, render, setupDom, stubLocation } from '../support/react.mjs';

const PAGES = {
  roller: true,
  events: true,
  account: true,
  remote: true,
  chromium: false,
  'vless-tunnel': true,
};

function setup({ me, pages = PAGES, connections = { connections: [] }, location } = {}) {
  authState.reset();
  const locationRef = location || stubLocation();
  const dom = setupDom('<div id="root"></div>', { location: locationRef });
  const fetchMock = mockFetch({
    'GET /api/auth/me': { payload: me },
    'GET /api/page-visibility': { payload: { pages } },
    'GET /api/connections': { payload: connections },
    'POST /api/auth/logout': { payload: { success: true } },
  });

  return {
    dom,
    document: dom.document,
    location: locationRef,
    fetchMock,
    teardown() {
      fetchMock.restore();
      dom.cleanup();
    },
  };
}

test('guests see the login link and only page-visible navigation', async () => {
  const { document, teardown } = setup({ me: { loggedIn: false } });
  try {
    render(<NavBar pathname="/roller.html" />);
    await flush();

    const login = document.querySelector('a[href="/login.html"]');
    assert.equal(login.textContent, 'Login');
    assert.equal(document.getElementById('logoutBtn'), null);
    assert.equal(document.querySelector('a[href="/admin.html"]'), null);
    assert.equal(document.querySelector('a[href="/remote.html"]'), null);

    const active = document.querySelector('a[href="/roller.html"]');
    assert.equal(active.classList.contains('active'), true);
    assert.equal(active.getAttribute('aria-current'), 'page');

    // Hidden by page visibility, while "events" stays visible for guests.
    assert.equal(document.querySelector('a[href="/chromium.html"]'), null);
    assert.equal(document.querySelector('a[href="/events.html"]') !== null, true);
    assert.equal(document.getElementById('logoutStatus').textContent, '');
  } finally {
    teardown();
  }
});

test('signed-in admins get account, admin and connected website menus', async () => {
  const { document, fetchMock, teardown } = setup({
    me: {
      loggedIn: true,
      user: { username: 'alice', role: 'admin', remoteAvailable: false },
    },
    connections: {
      connections: [
        { slug: 'internal-dashboard', name: 'Internal dashboard' },
        { slug: '/connect/evil?x=1', name: '<img src=x onerror=alert(1)>' },
      ],
    },
  });

  try {
    render(<NavBar pathname="/index.html" />);
    await flush();

    assert.equal(document.getElementById('navUsername').textContent, '👤 alice');
    assert.equal(document.querySelector('a[href="/files.html"]')?.textContent, 'Files');
    assert.equal(
      document.querySelector('a[href="/remote.html"]')?.hidden,
      true,
      'remote access is disabled for this account',
    );
    assert.equal(document.querySelector('a[href="/login.html"]') === null, true);

    // Workspace and management screens sit behind the two grouped menus.
    const workspaceMenu = document.getElementById('workspaceMenu');
    assert.equal(
      workspaceMenu.querySelector('a[href="/chromium.html"]'),
      null,
      'page visibility still filters grouped entries',
    );
    assert.equal(workspaceMenu.querySelector('a[href="/vless-tunnel.html"]') !== null, true);
    const manageMenu = document.getElementById('manageMenu');
    assert.equal(manageMenu.querySelector('a[href="/admin.html"]') !== null, true);
    assert.equal(manageMenu.querySelector('a[href="/guild-manager.html"]') !== null, true);

    const sectionToggles = [...document.querySelectorAll('.nav-menu-toggle')];
    assert.equal(sectionToggles.length, 2);
    assert.equal(sectionToggles.every(node => node.getAttribute('aria-expanded') === 'false'), true);
    click(sectionToggles[0]);
    await flush();
    assert.equal(sectionToggles[0].getAttribute('aria-expanded'), 'true');
    assert.equal(workspaceMenu.hidden, false);

    // Opening the websites menu closes the workspace menu again.
    const toggle = document.querySelector('.nav-dropdown-toggle');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    click(toggle);
    await flush();

    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(workspaceMenu.hidden, true);
    assert.equal(fetchMock.callsTo('GET', '/api/connections').length, 1);

    const menu = document.getElementById('websiteDropdownMenu');
    const links = [...menu.querySelectorAll('a[role="menuitem"]')];
    assert.equal(links.length, 2);
    assert.equal(links[0].getAttribute('href'), '/connect/internal-dashboard/');
    assert.equal(links[0].getAttribute('target'), '_blank');
    assert.equal(links[1].textContent.includes('<img src=x'), true, 'names stay text');
    assert.equal(menu.querySelectorAll('img').length, 0);
    assert.equal(links[1].getAttribute('href').startsWith('/connect/'), true);
    assert.equal(links[1].getAttribute('href').includes('<'), false);
  } finally {
    teardown();
  }
});

test('an unreadable account shows the shared error status', async () => {
  authState.reset();
  const dom = setupDom();
  const fetchMock = mockFetch({
    'GET /api/auth/me': { status: 500, payload: { error: 'boom' } },
    'GET /api/page-visibility': { payload: { pages: PAGES } },
  });

  try {
    render(<NavBar />);
    await flush();

    const status = dom.document.getElementById('logoutStatus');
    assert.equal(status.textContent, 'Unable to load account');
    assert.equal(status.classList.contains('status-error'), true);
    assert.equal(status.getAttribute('title'), 'boom');
  } finally {
    fetchMock.restore();
    dom.cleanup();
  }
});

test('logout posts to the API and redirects to the login page', async () => {
  const location = stubLocation();
  const { document, fetchMock, teardown, location: locationRef } = setup({
    me: { loggedIn: true, user: { username: 'alice', role: 'user', remoteAvailable: true } },
    location,
  });

  try {
    render(<NavBar />);
    await flush();

    click(document.getElementById('logoutBtn'));
    await flush();

    assert.equal(fetchMock.callsTo('POST', '/api/auth/logout').length, 1);
    assert.equal(locationRef.href, '/login.html');
  } finally {
    teardown();
  }
});
