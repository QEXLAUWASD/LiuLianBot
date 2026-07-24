const test = require('node:test');
const assert = require('node:assert/strict');
const { MIGRATIONS } = require('../src/db/migrate');

test('event migration creates shared event and account-link tables', () => {
  const migration = MIGRATIONS.find(item => item.version === '004');
  assert.ok(migration);
  const statements = [];
  const conn = { execute: async sql => { statements.push(sql); return [[]]; } };
  return migration.up(conn).then(() => {
    const sql = statements.join('\n');
    assert.match(sql, /website_events/);
    assert.match(sql, /website_event_participants/);
    assert.match(sql, /discord_user_id/);
    assert.match(sql, /website_link_codes/);
  });
});
