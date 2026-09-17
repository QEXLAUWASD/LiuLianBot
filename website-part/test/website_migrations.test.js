const test = require('node:test');
const assert = require('node:assert/strict');
const { MIGRATIONS, runMigrations } = require('../src/db/migrate');

test('runMigrations applies only unrecorded versions', async () => {
  const calls = [];
  const conn = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      if (sql === 'SELECT version FROM website_schema_migrations') {
        return [[{ version: '001' }]];
      }
      return [[]];
    },
  };
  let oldRuns = 0;
  let newRuns = 0;

  await runMigrations(conn, [
    { version: '001', name: 'old', up: async () => { oldRuns += 1; } },
    { version: '002', name: 'new', up: async () => { newRuns += 1; } },
  ]);

  assert.equal(oldRuns, 0);
  assert.equal(newRuns, 1);
  assert.ok(calls.some(([sql, params]) =>
    sql.startsWith('INSERT INTO website_schema_migrations') && params[0] === '002'
  ));
});

test('migration 017 widens uuid user identifiers and restores foreign keys', async () => {
  const migration = MIGRATIONS.find(item => item.version === '017');
  assert.ok(migration, 'migration 017 must exist');

  const statements = [];
  const conn = {
    async execute(sql) {
      statements.push(sql);
      if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
        return [[{
          table_name: 'website_user_roles',
          column_name: 'user_id',
          constraint_name: 'website_user_roles_ibfk_1',
          delete_rule: 'CASCADE',
          update_rule: 'RESTRICT',
        }]];
      }
      if (sql.includes('CHARACTER_MAXIMUM_LENGTH')) return [[{ length: 30 }]];
      return [[]];
    },
  };

  await migration.up(conn);
  const sql = statements.join('\n');

  assert.match(sql, /DROP FOREIGN KEY `website_user_roles_ibfk_1`/);
  assert.match(sql, /ALTER TABLE `website_users` MODIFY COLUMN `id` VARCHAR\(64\) NOT NULL/);
  assert.match(sql, /ALTER TABLE `website_user_roles` MODIFY COLUMN `user_id` VARCHAR\(64\) NOT NULL/);
  assert.match(sql, /ADD CONSTRAINT `website_user_roles_ibfk_1`/);
  assert.match(sql, /ON DELETE CASCADE ON UPDATE RESTRICT/);
  assert.match(sql, /website_rdp_profiles/);
});

test('migration 017 leaves wide columns untouched', async () => {
  const migration = MIGRATIONS.find(item => item.version === '017');
  const statements = [];
  const conn = {
    async execute(sql) {
      statements.push(sql);
      if (sql.includes('CHARACTER_MAXIMUM_LENGTH')) return [[{ length: 64 }]];
      return [[]];
    },
  };

  await migration.up(conn);

  assert.equal(statements.some(sql => /MODIFY COLUMN/.test(sql)), false);
  assert.equal(statements.some(sql => /DROP FOREIGN KEY/.test(sql)), false);
});
