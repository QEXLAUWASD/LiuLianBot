const test = require('node:test');
const assert = require('node:assert/strict');

test('page visibility catalog covers the configurable website subpages', () => {
  const { PAGE_DEFINITIONS, pageDefinition } = require('../src/services/page_visibility');
  assert.deepEqual(PAGE_DEFINITIONS.map(page => page.key), [
    'roller', 'events', 'account', 'remote', 'chromium',
  ]);
  assert.deepEqual(pageDefinition(' CHROMIUM '), {
    key: 'chromium', name: 'Chromium', path: '/chromium.html',
  });
  assert.equal(pageDefinition('admin'), null);
});

test('page visibility input normalizes audience IDs and validates switches', () => {
  const { normalizePageVisibility } = require('../src/services/page_visibility');
  assert.deepEqual(
    normalizePageVisibility('events', {
      public_access: false,
      authenticated_access: true,
      role_ids: [2, '2', 3],
      user_ids: ['user-1', 'user-1'],
    }),
    {
      page_key: 'events',
      public_access: false,
      authenticated_access: true,
      role_ids: [2, 3],
      user_ids: ['user-1'],
    },
  );
  assert.throws(
    () => normalizePageVisibility('events', {
      public_access: 'false', authenticated_access: true, role_ids: [], user_ids: [],
    }),
    /Public access must be a boolean/,
  );
  assert.throws(
    () => normalizePageVisibility('events', {
      public_access: false, authenticated_access: false, role_ids: [], user_ids: ['bad id'],
    }),
    /User IDs contains an invalid ID/,
  );
});

test('page visibility migration creates assignments and keeps current defaults', async () => {
  const { MIGRATIONS } = require('../src/db/migrate');
  const migration = MIGRATIONS.find(item => item.version === '012');
  assert.ok(migration);
  const statements = [];
  await migration.up({ execute: async sql => { statements.push(sql); return [[]]; } });
  const sql = statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS website_page_visibility/i);
  assert.match(sql, /website_page_visibility_roles/i);
  assert.match(sql, /website_page_visibility_users/i);
  assert.match(sql, /'roller', 1, 1/);
  assert.match(sql, /'events', 0, 1/);
});
