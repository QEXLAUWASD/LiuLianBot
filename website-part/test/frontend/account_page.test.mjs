import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountPage } from '../../frontend/src/pages/AccountPage.jsx';
import { authState } from '../../frontend/src/lib/authStore.mjs';
import { click, flush, mockFetch, render, setupDom, stubLocation, typeInto } from '../support/react.mjs';

function mount({ routes = {}, location = stubLocation() } = {}) {
  authState.reset();
  const dom = setupDom('<div id="root"></div>', { location });
  const fetchMock = mockFetch({
    'GET /api/auth/me': { payload: { loggedIn: true, user: { username: 'alice' } } },
    'GET /api/auth/discord-link': { payload: { linked: false } },
    ...routes,
  });
  render(<AccountPage />);
  return { dom, document: dom.document, fetchMock, location };
}

test('the account page loads the username and discord link state', async () => {
  const { dom, document, fetchMock } = mount();
  try {
    await flush();

    assert.equal(document.getElementById('newUsername').value, 'alice');
    assert.equal(document.getElementById('usernameStatus').textContent, '');
    assert.equal(document.getElementById('usernameForm').querySelector('button').disabled, false);
    assert.equal(fetchMock.callsTo('GET', '/api/auth/discord-link').length, 1);
    assert.equal(document.getElementById('discordLinkState').textContent, 'Not linked');
    assert.equal(document.getElementById('generateDiscordLink').hidden, false);
    assert.equal(document.getElementById('unlinkDiscord').hidden, true);
  } finally {
    dom.cleanup();
  }
});

test('updating the username clears the password field and refreshes the cached session', async () => {
  const { dom, document, fetchMock } = mount({
    routes: {
      'PUT /api/auth/username': { payload: { success: true, user: { username: 'alice2' } } },
    },
  });

  try {
    await flush();
    typeInto(document.getElementById('newUsername'), 'alice2');
    typeInto(document.getElementById('usernameCurrentPassword'), 'secret');
    click(document.querySelector('#usernameForm button[type="submit"]'));
    await flush();

    const updates = fetchMock.callsTo('PUT', '/api/auth/username');
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].body, { username: 'alice2', currentPassword: 'secret' });
    assert.equal(document.getElementById('usernameCurrentPassword').value, '');
    assert.equal(document.getElementById('usernameStatus').textContent, 'Username updated.');
    assert.equal(document.getElementById('usernameStatus').className.includes('status-success'), true);
    assert.equal(authState.peek().user.username, 'alice2');
  } finally {
    dom.cleanup();
  }
});

test('mismatched password confirmation is rejected locally', async () => {
  const { dom, document, fetchMock } = mount({
    routes: { 'PUT /api/auth/password': { payload: { success: true } } },
  });

  try {
    await flush();
    typeInto(document.getElementById('passwordCurrentPassword'), 'old-secret');
    typeInto(document.getElementById('newPassword'), 'new-secret');
    typeInto(document.getElementById('confirmPassword'), 'other-secret');
    click(document.querySelector('#passwordForm button[type="submit"]'));
    await flush();

    assert.equal(fetchMock.callsTo('PUT', '/api/auth/password').length, 0);
    assert.equal(document.getElementById('passwordStatus').textContent, 'New passwords do not match.');

    typeInto(document.getElementById('confirmPassword'), 'new-secret');
    click(document.querySelector('#passwordForm button[type="submit"]'));
    await flush();

    assert.equal(fetchMock.callsTo('PUT', '/api/auth/password').length, 1);
    assert.equal(document.getElementById('passwordStatus').textContent, 'Password updated.');
    assert.equal(document.getElementById('newPassword').value, '');
  } finally {
    dom.cleanup();
  }
});

test('discord linking generates a code and can be unlinked again', async () => {
  const { dom, document, fetchMock } = mount({
    routes: {
      'POST /api/auth/discord-link': { payload: { code: 'ABC123' } },
      'DELETE /api/auth/discord-link': { payload: { success: true } },
    },
  });

  try {
    await flush();
    click(document.getElementById('generateDiscordLink'));
    await flush();

    assert.equal(document.getElementById('discordLinkCode').hidden, false);
    assert.equal(document.getElementById('discordLinkCode').textContent, 'Run >link ABC123 in Discord within 10 minutes.');
    assert.equal(document.getElementById('discordLinkState').textContent, 'Code generated.');

    click(document.getElementById('unlinkDiscord'));
    await flush();

    assert.equal(fetchMock.callsTo('DELETE', '/api/auth/discord-link').length, 1);
    assert.equal(document.getElementById('discordLinkCode').hidden, true);
    assert.equal(document.getElementById('discordLinkState').textContent, 'Not linked');
  } finally {
    dom.cleanup();
  }
});

test('an expired session redirects to the login page', async () => {
  const location = stubLocation();
  const { dom, fetchMock } = mount({
    location,
    routes: {
      'GET /api/auth/me': { status: 401, payload: { error: 'Not signed in' } },
    },
  });

  try {
    await flush();
    assert.equal(location.href, '/login.html');
  } finally {
    fetchMock.restore();
    dom.cleanup();
  }
});
