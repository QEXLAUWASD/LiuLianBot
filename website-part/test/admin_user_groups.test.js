const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

async function createAdminServer() {
  const dbPath = require.resolve('../src/db');
  const authPath = require.resolve('../src/middleware/admin_auth');
  const routePath = require.resolve('../src/routes/admin');
  const updates = [];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      getAllUsers: async () => [],
      updateUserRoles: async (userId, roleIds) => {
        updates.push({ userId, roleIds });
        return { id: userId, role_ids: roleIds };
      },
      deleteUser: async () => true,
      getAllRoles: async () => [
        { id: 1, name: 'admin' },
        { id: 2, name: 'user' },
        { id: 3, name: 'moderator' },
      ],
      createRole: async () => null,
      updateRole: async () => null,
      deleteRole: async () => true,
      getAllGuilds: async () => [],
      getGuildDetail: async () => null,
    },
  };
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: { requireAdmin: (req, res, next) => next() },
  };
  delete require.cache[routePath];

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: { id: 'admin-1', username: 'admin' } };
    next();
  });
  app.use(require(routePath));

  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    updates,
    update: (userId, roleIds) => fetch(`${baseUrl}/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_ids: roleIds }),
    }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('admin API assigns multiple unique groups to a user', async t => {
  const fixture = await createAdminServer();
  t.after(fixture.close);

  const response = await fixture.update('user-2', [2, 3, 2]);
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.updates, [
    { userId: 'user-2', roleIds: [2, 3] },
  ]);
});

test('admin API requires at least one valid group', async t => {
  const fixture = await createAdminServer();
  t.after(fixture.close);

  assert.equal((await fixture.update('user-2', [])).status, 400);
  assert.equal((await fixture.update('user-2', ['2'])).status, 400);
  assert.equal(fixture.updates.length, 0);
});

test('administrator cannot remove their own admin group', async t => {
  const fixture = await createAdminServer();
  t.after(fixture.close);

  const denied = await fixture.update('admin-1', [2, 3]);
  assert.equal(denied.status, 400);
  assert.equal(fixture.updates.length, 0);

  const allowed = await fixture.update('admin-1', [1, 3]);
  assert.equal(allowed.status, 200);
  assert.deepEqual(fixture.updates[0], {
    userId: 'admin-1',
    roleIds: [1, 3],
  });
});
