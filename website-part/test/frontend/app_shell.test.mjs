import assert from 'node:assert/strict';
import test, { before } from 'node:test';

import { App, PAGE_COMPONENTS, PAGE_LOADERS, PAGES_WITH_NAV } from '../../frontend/src/App.jsx';
import { authState } from '../../frontend/src/lib/authStore.mjs';
import {
  click,
  flush,
  mockFetch,
  render,
  selectOption,
  setupDom,
  stubLocation,
  typeInto,
} from '../support/react.mjs';

const PAGES = {
  roller: true,
  events: true,
  account: true,
  remote: true,
  chromium: true,
  'vless-tunnel': true,
};

// Preload every lazy page chunk so the first render of a page resolves within
// the normal act() flush instead of depending on filesystem import timing.
before(async () => {
  await Promise.all(Object.values(PAGE_LOADERS).map(load => load()));
});

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
  for (const [page, load] of Object.entries(PAGE_LOADERS)) {
    assert.equal(typeof load, 'function', `${page} needs a loader`);
    assert.ok(PAGE_COMPONENTS[page], `${page} needs a lazy component`);
  }
  for (const page of ['login', 'terms']) {
    assert.equal(typeof PAGE_COMPONENTS[page], 'function', `${page} needs a static component`);
  }
  assert.equal(PAGES_WITH_NAV.has('login'), false);
  assert.equal(PAGES_WITH_NAV.has('dashboard'), true);
});

const DASHBOARD_EVENTS = [
  {
    id: 1,
    title: 'Friday night ranked',
    mode: 'Ranked',
    start_at: '2026-09-18T12:00:00.000Z',
    guild_name: 'LiuLian',
    participant_count: 4,
    max_players: 10,
    joined: 1,
  },
  {
    id: 2,
    title: 'Casual customs',
    mode: 'Custom',
    start_at: '2026-09-19T12:00:00.000Z',
    guild_name: 'LiuLian',
    participant_count: 10,
    max_players: 10,
    joined: 0,
  },
];

function mountDashboard(routes = {}, me) {
  return mount('dashboard', {
    'GET /api/events': { payload: { events: DASHBOARD_EVENTS } },
    'GET /api/connections': { payload: { connections: [{ slug: 'nas', name: 'FnOS NAS' }] } },
    ...routes,
  }, {
    me: me ?? { loggedIn: true, user: { username: 'alice', role: 'user', remoteAvailable: false } },
  });
}

test('the dashboard greets the user and summarises events, websites and tools', async () => {
  const { dom, document } = mountDashboard();

  try {
    await flush();

    assert.equal(document.getElementById('welcomeName').textContent, 'alice');
    assert.ok(document.querySelector('.navbar.sidebar'), 'authenticated pages keep the shared navigation');
    assert.ok(document.querySelector('.topbar'), 'the frame renders a top bar');
    assert.equal(document.querySelectorAll('.stat-card').length, 4);
    assert.equal(document.getElementById('statUpcoming').textContent, '2');
    assert.equal(document.getElementById('statJoined').textContent, '1');
    assert.equal(document.getElementById('statWebsites').textContent, '1');
    assert.equal(
      document.getElementById('statTools').textContent,
      '5',
      'the remote tool is hidden for accounts without remote access',
    );

    const tools = [...document.querySelectorAll('.tool-row')];
    assert.equal(tools.length, 5);
    assert.equal(tools.some(tool => tool.getAttribute('href') === '/roller.html?tab=map'), true);
    assert.equal(document.getElementById('remoteFeatureCard'), null);

    const priority = [...document.querySelectorAll('#priorityList .list-row')];
    assert.equal(priority.length, 2);
    assert.equal(priority[0].textContent.includes('Friday night ranked'), true);
    assert.equal(priority[0].querySelector('.badge').textContent, 'Joined');
    assert.equal(priority[1].querySelector('.badge').textContent, 'Full');
  } finally {
    dom.cleanup();
  }
});

test('the dashboard table filters, sorts and paginates events', async () => {
  const extra = Array.from({ length: 4 }, (_, index) => ({
    id: index + 3,
    title: `Practice block ${index + 1}`,
    mode: 'Casual',
    start_at: `2026-09-2${index}T12:00:00.000Z`,
    guild_name: 'LiuLian',
    participant_count: index,
    max_players: 10,
    joined: 0,
  }));

  const { dom, document } = mountDashboard({
    'GET /api/events': { payload: { events: [...DASHBOARD_EVENTS, ...extra] } },
  });

  try {
    await flush();

    const rows = () => [...document.querySelectorAll('#eventTableBody tr')];
    assert.equal(rows().length, 5, 'the first page shows five of the six events');
    assert.equal(document.getElementById('eventTableCount').textContent, '6 events');
    assert.equal(document.getElementById('eventPageIndicator').textContent, '1/2');
    assert.equal(document.getElementById('eventSearch').value, '');

    const next = [...document.querySelectorAll('.pager button')][1];
    click(next);
    await flush();
    assert.equal(document.getElementById('eventPageIndicator').textContent, '2/2');
    assert.equal(rows().length, 1);

    // Filtering resets the page and narrows the table down.
    typeInto(document.getElementById('eventSearch'), 'casual customs');
    await flush();
    assert.equal(document.getElementById('eventPageIndicator').textContent, '1/1');
    assert.equal(document.getElementById('eventTableCount').textContent, '1 event');
    assert.equal(rows().length, 1);
    assert.equal(rows()[0].textContent.includes('Casual customs'), true);

    typeInto(document.getElementById('eventSearch'), '');
    selectOption(document.getElementById('eventStatusFilter'), 'joined');
    await flush();
    assert.equal(rows().length, 1);
    assert.equal(rows()[0].textContent.includes('Friday night ranked'), true);

    selectOption(document.getElementById('eventStatusFilter'), 'all');
    selectOption(document.getElementById('eventSort'), 'signups');
    await flush();
    assert.equal(rows()[0].textContent.includes('Casual customs'), true, 'sorted by signup count');
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
