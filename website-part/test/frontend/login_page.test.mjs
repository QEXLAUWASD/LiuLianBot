import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';

import { LoginPage, postAuthDestination } from '../../frontend/src/pages/LoginPage.jsx';
import { consentDestination } from '../../frontend/src/pages/TermsPage.jsx';
import { click, flush, mockFetch, press, render, setupDom, stubLocation, typeInto } from '../support/react.mjs';

function mount({ routes = {}, search = '' } = {}) {
  const location = stubLocation({ href: '/login.html', search });
  const dom = setupDom('<div id="root"></div>', { location });
  const fetchMock = mockFetch({
    'GET /api/auth/terms-status': { payload: { required: true } },
    ...routes,
  });
  const view = render(<LoginPage />);
  return {
    document: dom.document,
    fetchMock,
    location,
    cleanup() {
      view.unmount();
      fetchMock.restore();
      dom.cleanup();
    },
  };
}

function fillLogin(document, password = 'existing-password') {
  typeInto(document.getElementById('loginUsername'), 'alice');
  typeInto(document.getElementById('loginPassword'), password);
}

function submit(document, id) {
  act(() => document.getElementById(id).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

test('login returns to protected pages and connections while rejecting external destinations', () => {
  for (const target of ['/files.html?path=%2Fphotos#recent', '/connect/nas/files?view=list&sort=name', '/events.html']) {
    assert.equal(postAuthDestination(`?next=${encodeURIComponent(target)}`), target);
  }
  for (const target of ['https://elsewhere.test', '//elsewhere.test', '/\\elsewhere.test', '/\n/elsewhere.test', '/..//elsewhere.test', '/%2e%2e//elsewhere.test', '/login.html', '/terms.html']) {
    assert.equal(postAuthDestination(`?next=${encodeURIComponent(target)}`), '/index.html');
  }
  assert.equal(postAuthDestination(''), '/index.html');
});

test('login preserves the complete destination through terms consent and remembers the user preference', async () => {
  const target = '/connect/nas/files?view=list&sort=name#recent';
  const page = mount({
    search: `?next=${encodeURIComponent(target)}`,
    routes: { 'POST /api/auth/login': { payload: { success: true, termsRequired: true } } },
  });
  try {
    await flush();
    fillLogin(page.document, 'old');
    click(page.document.getElementById('rememberLogin'));
    click(page.document.querySelector('#loginForm button[type="submit"]'));
    await flush();

    assert.deepEqual(page.fetchMock.callsTo('POST', '/api/auth/login')[0].body, { username: 'alice', password: 'old', remember: true });
    assert.equal(page.document.getElementById('loginPassword').hasAttribute('minlength'), false, 'existing passwords must not be subject to new-password policy');
    assert.equal(page.location.href, `/terms.html?next=${encodeURIComponent(target)}`);
    assert.equal(consentDestination(new URL(page.location.href, 'https://example.test').search), target);
  } finally {
    page.cleanup();
  }
});

test('password controls preserve the value, never submit and reset visibility on tab changes', async () => {
  const page = mount();
  try {
    await flush();
    fillLogin(page.document);
    const toggle = page.document.querySelector('[aria-controls="loginPassword"]');
    click(toggle);
    assert.equal(page.document.getElementById('loginPassword').type, 'text');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(page.document.getElementById('loginPassword').value, 'existing-password');
    assert.equal(page.fetchMock.callsTo('POST', '/api/auth/login').length, 0);

    const loginTab = page.document.getElementById('login-tab');
    loginTab.focus();
    press(loginTab, 'ArrowRight');
    assert.equal(page.document.activeElement.id, 'register-tab');
    assert.equal(page.document.getElementById('regPassword').type, 'password');
    assert.equal(page.document.getElementById('registerForm').hidden, false);
    press(page.document.getElementById('register-tab'), 'ArrowLeft');
    assert.equal(page.document.getElementById('loginPassword').type, 'password');
  } finally {
    page.cleanup();
  }
});

test('pending sign-in prevents repeat and cross-tab submissions and shows a useful network error', async () => {
  let rejectRequest;
  const page = mount({
    routes: { 'POST /api/auth/login': () => new Promise((_, reject) => { rejectRequest = reject; }) },
  });
  try {
    await flush();
    fillLogin(page.document);
    submit(page.document, 'loginForm');
    submit(page.document, 'loginForm');
    const button = page.document.querySelector('#loginForm button[type="submit"]');
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, 'Signing in…');
    assert.equal(page.document.getElementById('loginForm').getAttribute('aria-busy'), 'true');
    assert.equal(page.document.getElementById('register-tab').disabled, true);
    assert.equal(page.document.getElementById('loginPassword').disabled, true);
    assert.equal(page.fetchMock.callsTo('POST', '/api/auth/login').length, 1);

    rejectRequest(new Error('offline'));
    await flush();
    assert.equal(button.disabled, false);
    assert.equal(page.document.getElementById('register-tab').disabled, false);
    assert.match(page.document.getElementById('loginError').textContent, /Check your connection and try again/);
    assert.equal(page.location.href, '/login.html');
  } finally {
    page.cleanup();
  }
});

test('registration rejects whitespace usernames and requires consent before sending credentials', async () => {
  const page = mount({
    search: '?next=%2Fevents.html',
    routes: { 'POST /api/auth/register': { payload: { success: true } } },
  });
  try {
    await flush();
    click(page.document.getElementById('register-tab'));
    typeInto(page.document.getElementById('regUsername'), '   ');
    typeInto(page.document.getElementById('regPassword'), 'unique-secret');
    submit(page.document, 'registerForm');
    assert.match(page.document.getElementById('regError').textContent, /Username must/);
    assert.equal(page.fetchMock.callsTo('POST', '/api/auth/register').length, 0);

    typeInto(page.document.getElementById('regUsername'), ' alice ');
    submit(page.document, 'registerForm');
    assert.match(page.document.getElementById('regError').textContent, /Please accept/);
    assert.equal(page.fetchMock.callsTo('POST', '/api/auth/register').length, 0);

    click(page.document.getElementById('termsAccepted'));
    click(page.document.querySelector('#registerForm button[type="submit"]'));
    await flush();
    assert.deepEqual(page.fetchMock.callsTo('POST', '/api/auth/register')[0].body, { username: 'alice', password: 'unique-secret', termsAccepted: true });
    assert.equal(page.location.href, '/events.html');
  } finally {
    page.cleanup();
  }
});

test('registration respects disabled terms and surfaces server validation without losing input', async () => {
  const page = mount({
    routes: {
      'GET /api/auth/terms-status': { payload: { required: false } },
      'POST /api/auth/register': { status: 409, payload: { error: 'Username already exists' } },
    },
  });
  try {
    await flush();
    click(page.document.getElementById('register-tab'));
    assert.equal(page.document.getElementById('termsAcceptanceRow').hidden, true);
    assert.equal(page.document.getElementById('termsAccepted').required, false);
    typeInto(page.document.getElementById('regUsername'), 'alice');
    typeInto(page.document.getElementById('regPassword'), 'unique-secret');
    click(page.document.querySelector('#registerForm button[type="submit"]'));
    await flush();
    assert.equal(page.fetchMock.callsTo('POST', '/api/auth/register')[0].body.termsAccepted, false);
    assert.equal(page.document.getElementById('regError').textContent, 'Username already exists');
    assert.equal(page.document.getElementById('regUsername').value, 'alice');
    assert.equal(page.document.getElementById('regPassword').value, 'unique-secret');
    assert.equal(page.location.href, '/login.html');
  } finally {
    page.cleanup();
  }
});
