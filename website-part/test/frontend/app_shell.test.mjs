import assert from 'node:assert/strict';
import test from 'node:test';

import { App, PAGE_COMPONENTS, PAGES_WITH_NAV } from '../../frontend/src/App.jsx';
import { authState } from '../../frontend/src/lib/authStore.mjs';
import { flush, mockFetch, render, setupDom, stubLocation } from '../support/react.mjs';

const PAGES = {
  roller: true,
  events: true,
  account: true,
  remote: true,
  chromium: true,
  'vless-tunnel': true,
};

function mount(page, routes = {}, { me } = {}) {
  authState.reset();
  const dom = setupDom('<div id="root"></div>', { location: stubLocation({ pathname: `/${page}.html` }) });
  const fetchMock = mockFetch({
    'GET /api/auth/me': { payload: me ?? { loggedIn: true, user: { username: 'alice', role: 'user', remoteAvailable: true } } },
    'GET /api/page-visibility': { payload: { pages: PAGES } },
    'GET /api/connections': { payload: { connections: [] } },
    ...routes,
  });
  render(<App page={page} />);
  return { dom, document: dom.document, fetchMock };
}

test('every configured page resolves to a navigable component', () => {
  for (const page of Object.keys(PAGE_COMPONENTS)) {
    assert.equal(typeof PAGE_COMPONENTS[page], 'function', `${page} needs a component`);
  }
  assert.equal(PAGES_WITH_NAV.has('login'), false);
  assert.equal(PAGES_WITH_NAV.has('dashboard'), true);
});

test('the dashboard greets the signed-in user and hides unavailable pages', async () => {
  const { dom, document } = mount('dashboard', {}, {
    me: { loggedIn: true, user: { username: 'alice', role: 'user', remoteAvailable: false } },
  });

  try {
    await flush();

    assert.equal(document.getElementById('welcomeName').textContent, 'alice');
    const cards = [...document.querySelectorAll('.feature-card')];
    assert.equal(cards.length, 5, 'the remote card is hidden for accounts without remote access');
    assert.equal(cards.some(card => card.id === 'remoteFeatureCard'), false);
    assert.equal(cards.some(card => card.getAttribute('href') === '/roller.html?tab=map'), true);
    assert.ok(document.querySelector('.navbar'), 'authenticated pages keep the shared navigation');
  } finally {
    dom.cleanup();
  }
});

test('the terms page asks for consent only when the server requires it', async () => {
  const { dom, document } = mount('terms', {
    'GET /api/auth/terms-status': { payload: { required: true } },
    'GET /api/auth/me': { payload: { loggedIn: true, user: { username: 'alice', termsAccepted: false } } },
  });

  try {
    await flush();

    assert.equal(document.querySelector('.legal-page h1').textContent, '服務條款與資料儲存說明');
    assert.equal(document.getElementById('termsConsent').hidden, false);
    assert.equal(document.querySelector('.navbar'), null, 'the terms page is standalone');
  } finally {
    dom.cleanup();
  }
});

test('unknown page keys fall back to the 404 screen', () => {
  const dom = setupDom('<div id="root"></div>');
  try {
    render(<App page="does-not-exist" />);
    assert.equal(dom.document.querySelector('.error-page h1').textContent, '404');
    assert.equal(dom.document.querySelector('a[href="/"]').textContent, 'Go Home');
  } finally {
    dom.cleanup();
  }
});

test('the guild manager lists manageable servers and renders its settings form', async () => {
  const { dom, document, fetchMock } = mount('guild-manager', {
    'GET /api/guild-manager/guilds': { payload: { guilds: [{ guild_id: '111', guild_name: 'LiuLian' }] } },
    'GET /api/guild-manager/guilds/111': {
      payload: {
        guild: {
          guild_id: '111',
          guild_name: 'LiuLian',
          language: 'zh_TW',
          private_voice_trigger_channel_id: null,
          fallback_log_channel_id: null,
          log_channels: {},
          channels: [
            { channel_id: '1', channel_name: 'general', channel_type: 'text' },
            { channel_id: '2', channel_name: 'Lobby', channel_type: 'voice' },
          ],
        },
        logTypes: ['all', 'message'],
        languages: ['en', 'zh_TW'],
      },
    },
  });

  try {
    await flush();

    assert.equal(fetchMock.callsTo('GET', '/api/guild-manager/guilds').length, 1);
    assert.equal(document.querySelector('#guildList .guild-list-item').textContent, 'LiuLian');
    assert.equal(document.getElementById('guildName').textContent, 'LiuLian');
    assert.deepEqual(
      [...document.getElementById('guildLanguage').options].map(option => option.value),
      ['en', 'zh_TW'],
    );
    assert.deepEqual(
      [...document.getElementById('privateVoiceTriggerChannel').options].map(option => option.textContent),
      ['Disabled', 'Lobby'],
    );
    assert.equal(document.querySelectorAll('#logChannelFields select').length, 2);
  } finally {
    dom.cleanup();
  }
});
