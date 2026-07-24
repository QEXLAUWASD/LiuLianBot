const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

async function fixture({ role = 'admin' } = {}) {
  const dbPath = require.resolve('../src/db');
  const routePath = require.resolve('../src/routes/events');
  const adminAuthPath = require.resolve('../src/middleware/admin_auth');
  const events = [];
  let nextId = 1;
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      createEvent: async data => {
        const event = { id: nextId++, ...data, participant_count: 0 };
        events.push(event);
        return event;
      },
      listEvents: async () => events,
      joinEvent: async () => ({ joined: true }),
      leaveEvent: async () => ({ left: true }),
      findUserById: async () => ({ id: 'user-1', role_name: role, discord_user_id: '123456789012345678' }),
    },
  };
  delete require.cache[adminAuthPath];
  delete require.cache[routePath];
  const router = require(routePath);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user: { id: 'user-1', username: 'player' } };
    next();
  });
  app.use('/api/events', router);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    request: (path, options = {}) => fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json' }, ...options,
    }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('event creation validates title, start time, and capacity', async t => {
  const app = await fixture();
  t.after(app.close);
  const response = await app.request('/api/events', {
    method: 'POST',
    body: JSON.stringify({ title: 'Ranked night', guildId: '123456789012345678', startAt: 'invalid', maxPlayers: 0 }),
  });
  assert.equal(response.status, 400);
});

test('authenticated users can list and join or leave events', async t => {
  const app = await fixture();
  t.after(app.close);
  let response = await app.request('/api/events');
  assert.equal(response.status, 200);
  response = await app.request('/api/events/1/join', { method: 'POST' });
  assert.equal(response.status, 200);
  response = await app.request('/api/events/1/leave', { method: 'POST' });
  assert.equal(response.status, 200);
});

test('only administrators can create events', async t => {
  const app = await fixture({ role: 'user' });
  t.after(app.close);
  const response = await app.request('/api/events', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Ranked night', guildId: '123456789012345678',
      startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), maxPlayers: 10,
    }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Admin access required' });
});
