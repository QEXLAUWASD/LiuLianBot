import assert from 'node:assert/strict';
import test from 'node:test';

import { EventsPage } from '../../frontend/src/pages/EventsPage.jsx';
import { authState } from '../../frontend/src/lib/authStore.mjs';
import { click, flush, mockFetch, render, setupDom, typeInto } from '../support/react.mjs';

const EVENT = {
  id: 7,
  title: 'Ranked night',
  mode: 'Custom match',
  start_at: '2026-07-24T12:30:00.000Z',
  description: 'Bring your best operators.',
  guild_name: 'LiuLian',
  creator_username: 'alice',
  participant_count: 3,
  max_players: 10,
  joined: 0,
};

function mount({ user = { username: 'alice', role: 'user' }, events = [EVENT], routes = {} } = {}) {
  authState.reset();
  const dom = setupDom('<div id="root"></div>', { url: 'https://example.test/events.html' });
  const fetchMock = mockFetch({
    'GET /api/auth/me': { payload: { loggedIn: true, user } },
    'GET /api/events': { payload: { events } },
    'POST /api/events/7/join': { payload: { success: true } },
    'POST /api/events/7/leave': { payload: { success: true } },
    'POST /api/events': { payload: { success: true } },
    ...routes,
  });
  render(<EventsPage />);
  return { dom, document: dom.document, fetchMock };
}

test('events render with UTC+8 start times and a join action', async () => {
  const { dom, document, fetchMock } = mount();
  try {
    await flush();

    const card = document.querySelector('#eventList .event-card');
    assert.equal(card.querySelector('h2').textContent, 'Ranked night');
    assert.match(card.querySelector('.event-meta').textContent, /20:30/);
    assert.match(card.querySelector('.event-detail').textContent, /Server LiuLian \| Host alice/);
    assert.equal(card.querySelector('.event-card-action strong').textContent, '3/10');

    click(card.querySelector('.event-card-action button'));
    await flush();

    assert.equal(fetchMock.callsTo('POST', '/api/events/7/join').length, 1);
    assert.equal(fetchMock.callsTo('GET', '/api/events').length, 2, 'the list reloads after joining');
  } finally {
    dom.cleanup();
  }
});

test('joined events offer a leave action', async () => {
  const { dom, document, fetchMock } = mount({ events: [{ ...EVENT, joined: 1 }] });
  try {
    await flush();

    const button = document.querySelector('.event-card-action button');
    assert.equal(button.textContent, 'Leave');
    assert.equal(button.className.includes('btn-outline'), true);

    click(button);
    await flush();

    assert.equal(fetchMock.callsTo('POST', '/api/events/7/leave').length, 1);
  } finally {
    dom.cleanup();
  }
});

test('only admins can create events and the payload uses the shared client', async () => {
  const { dom, document, fetchMock } = mount({ user: { username: 'root', role: 'admin' } });
  try {
    await flush();

    click(document.getElementById('showCreateEvent'));
    assert.equal(document.getElementById('createEventPanel').hidden, false);

    typeInto(document.getElementById('eventTitle'), 'Weekly scrim');
    typeInto(document.getElementById('eventGuild'), '1234');
    typeInto(document.getElementById('eventStart'), '2026-07-24T20:30');
    click(document.querySelector('#eventForm button[type="submit"]'));
    await flush();

    const created = fetchMock.callsTo('POST', '/api/events');
    assert.equal(created.length, 1);
    assert.deepEqual(created[0].body, {
      title: 'Weekly scrim',
      mode: 'Custom match',
      guildId: '1234',
      channelId: null,
      startAt: '2026-07-24T12:30:00.000Z',
      maxPlayers: 10,
      description: '',
    });
    assert.equal(document.getElementById('createEventPanel').hidden, true);
  } finally {
    dom.cleanup();
  }
});

test('non-admins never see the create panel', async () => {
  const { dom, document } = mount();
  try {
    await flush();
    assert.equal(document.getElementById('showCreateEvent'), null);
    assert.equal(document.getElementById('createEventPanel'), null);
  } finally {
    dom.cleanup();
  }
});
