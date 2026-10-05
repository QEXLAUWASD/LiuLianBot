import assert from 'node:assert/strict';
import test from 'node:test';

import { DashboardPage } from '../../frontend/src/pages/DashboardPage.jsx';
import { authState } from '../../frontend/src/lib/authStore.mjs';
import { click, flush, mockFetch, render, setupDom, stubLocation, typeInto } from '../support/react.mjs';

const PAGES = { events: true, roller: true, account: true, remote: true, chromium: true, 'vless-tunnel': true };
const EVENT = { id: 1, title: 'Friday match', participant_count: 2, max_players: 10, joined: 1 };

function mount(t, routes = {}, location) {
  authState.reset();
  const dom = setupDom('<div id="root"></div>', { location });
  const fetchMock = mockFetch({
    'GET /api/auth/me': { payload: { loggedIn: true, user: { id: 3, username: 'alice' } } },
    'GET /api/page-visibility': { payload: { pages: PAGES } },
    'GET /api/events': { payload: { events: [EVENT] } },
    'GET /api/connections': { payload: { connections: [{ slug: 'nas' }] } },
    ...routes,
  });
  const mounted = render(<DashboardPage />);
  t.after(() => {
    mounted.unmount();
    fetchMock.restore();
    dom.cleanup();
  });
  return { document: dom.document, fetchMock, mounted };
}

test('authentication loading is distinct from a guest workspace', async t => {
  let resolveAuth;
  const { document, fetchMock } = mount(t, {
    'GET /api/auth/me': () => new Promise(resolve => { resolveAuth = resolve; }),
  });
  await flush();
  assert.match(document.querySelector('[role="status"]').textContent, /Loading/);
  assert.equal(document.querySelector('a[href="/login.html"]'), null);
  assert.equal(document.querySelector('.stat-grid'), null);
  assert.equal(fetchMock.callsTo('GET', '/api/events').length, 0);

  resolveAuth({ payload: { loggedIn: false } });
  await flush();
  assert.ok(document.querySelector('h1').textContent.trim());
  assert.doesNotMatch(document.querySelector('h1').textContent.trim(), /,$/);
  assert.ok(document.querySelector('a[href="/login.html"]'));
  assert.equal(document.querySelector('.stat-grid'), null);
  assert.equal(document.getElementById('priorityPanel'), null);
  assert.equal(document.getElementById('eventTableBody'), null);
  assert.equal(document.querySelectorAll('.tool-row').length, 2);
  assert.equal(fetchMock.callsTo('GET', '/api/connections').length, 0);
});

test('an authentication failure shows a retry action instead of guest content', async t => {
  let reloads = 0;
  const { document, fetchMock } = mount(t, {
    'GET /api/auth/me': { status: 503, payload: { error: 'Account service unavailable' } },
  }, stubLocation({ reload() { reloads += 1; } }));
  await flush();
  assert.match(document.querySelector('[role="alert"]').textContent, /Account service unavailable/);
  assert.equal(document.querySelector('a[href="/login.html"]'), null);
  assert.equal(document.querySelector('.stat-grid'), null);
  assert.equal(fetchMock.callsTo('GET', '/api/events').length, 0);
  click([...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Try again'));
  assert.equal(reloads, 1);
});

test('failed dashboard requests retain unknown counts and can be retried independently', async t => {
  let eventAttempts = 0;
  let connectionAttempts = 0;
  const { document, fetchMock } = mount(t, {
    'GET /api/events': () => ++eventAttempts === 1
      ? { status: 503, payload: { error: 'Events API offline' } }
      : { payload: { events: [EVENT] } },
    'GET /api/connections': () => ++connectionAttempts === 1
      ? { status: 503, payload: { error: 'Websites API offline' } }
      : { payload: { connections: [{ slug: 'nas' }] } },
  });
  await flush();
  for (const id of ['statUpcoming', 'statJoined', 'statWebsites']) {
    assert.equal(document.getElementById(id).textContent, '–');
  }
  assert.equal(document.getElementById('eventTableCount').textContent, 'Events unavailable');
  assert.doesNotMatch(document.getElementById('priorityPanel').textContent, /No upcoming events/);
  const alerts = [...document.querySelectorAll('[role="alert"]')];
  assert.equal(alerts.length, 2);
  const eventsAlert = alerts.find(alert => alert.textContent.includes('Events API offline'));
  const websitesAlert = alerts.find(alert => alert.textContent.includes('Websites API offline'));
  click(eventsAlert.parentElement.querySelector('button'));
  await flush();
  assert.equal(document.getElementById('statUpcoming').textContent, '1');
  assert.equal(document.getElementById('statJoined').textContent, '1');
  assert.equal(document.getElementById('statWebsites').textContent, '–');
  assert.equal(connectionAttempts, 1, 'retrying events does not refetch websites');
  click(websitesAlert.parentElement.querySelector('button'));
  await flush();
  assert.equal(document.getElementById('statWebsites').textContent, '1');
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.equal(eventAttempts, 2);
  assert.equal(connectionAttempts, 2);
  assert.equal(fetchMock.callsTo('GET', '/api/events')[0].options.signal.aborted, true);
});

test('hidden events are neither requested nor exposed by dashboard counts', async t => {
  const { document, fetchMock } = mount(t, {
    'GET /api/page-visibility': { payload: { pages: { ...PAGES, events: false } } },
  });
  await flush();
  assert.equal(fetchMock.callsTo('GET', '/api/events').length, 0);
  assert.equal(document.getElementById('priorityPanel'), null);
  assert.equal(document.getElementById('eventTableBody'), null);
  assert.equal(document.getElementById('statUpcoming').textContent, '–');
  assert.equal(document.getElementById('statJoined').textContent, '–');
  assert.equal(document.getElementById('statWebsites').textContent, '1');
});

test('a delayed event permission change aborts the request and ignores stale results', async t => {
  let resolvePages;
  let resolveEvents;
  const { document, fetchMock } = mount(t, {
    'GET /api/page-visibility': () => new Promise(resolve => { resolvePages = resolve; }),
    'GET /api/events': () => new Promise(resolve => { resolveEvents = resolve; }),
  });
  await flush();
  const request = fetchMock.callsTo('GET', '/api/events')[0];
  assert.equal(request.options.signal.aborted, false);
  assert.equal(document.getElementById('statUpcoming').textContent, '–');
  assert.equal(document.getElementById('eventTableCount').textContent, 'Loading events…');

  resolvePages({ payload: { pages: { ...PAGES, events: false } } });
  await flush();
  assert.equal(request.options.signal.aborted, true);
  resolveEvents({ payload: { events: [{ ...EVENT, title: 'Restricted event' }] } });
  await flush();
  assert.equal(document.getElementById('priorityPanel'), null);
  assert.equal(document.getElementById('eventTableBody'), null);
  assert.doesNotMatch(document.body.textContent, /Restricted event/);
  assert.equal(document.getElementById('statUpcoming').textContent, '–');
  assert.equal(fetchMock.callsTo('GET', '/api/connections').length, 1);
});

test('leaving the dashboard aborts both pending data requests', async t => {
  const { fetchMock, mounted } = mount(t, {
    'GET /api/events': () => new Promise(() => {}),
    'GET /api/connections': () => new Promise(() => {}),
  });
  await flush();
  const eventSignal = fetchMock.callsTo('GET', '/api/events')[0].options.signal;
  const connectionSignal = fetchMock.callsTo('GET', '/api/connections')[0].options.signal;
  assert.equal(eventSignal.aborted, false);
  assert.equal(connectionSignal.aborted, false);
  mounted.unmount();
  assert.equal(eventSignal.aborted, true);
  assert.equal(connectionSignal.aborted, true);
});

test('a successfully loaded empty event list explains how to get started', async t => {
  const { document } = mount(t, { 'GET /api/events': { payload: { events: [] } } });
  await flush();
  assert.equal(document.getElementById('statUpcoming').textContent, '0');
  assert.match(document.getElementById('eventTableBody').textContent, /No upcoming events yet/);
  assert.doesNotMatch(document.getElementById('eventTableBody').textContent, /No events match/);
  assert.equal(document.getElementById('eventsTableHeading').classList.contains('sr-only'), false);
});

test('filtering shows a live result count and an action to restore all events', async t => {
  const { document } = mount(t);
  await flush();
  typeInto(document.getElementById('eventSearch'), 'nonexistent match');
  await flush();
  assert.match(document.getElementById('eventTableBody').textContent, /No events match these filters/);
  const count = document.getElementById('eventTableCount');
  assert.equal(count.textContent, '0 events');
  assert.equal(count.getAttribute('aria-live'), 'polite');
  click([...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Clear filters'));
  await flush();
  assert.equal(document.getElementById('eventSearch').value, '');
  assert.equal(count.textContent, '1 event');
  assert.match(document.getElementById('eventTableBody').textContent, /Friday match/);
});
