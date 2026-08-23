const test = require('node:test');
const assert = require('node:assert/strict');
const { MIGRATIONS } = require('../src/db/migrate');

test('guild manager migration adds a channel type for private voice settings', async () => {
  const migration = MIGRATIONS.find(item => item.version === '014');
  assert.ok(migration);
  const statements = [];
  await migration.up({ execute: async sql => { statements.push(sql); return [[]]; } });
  assert.match(statements.join('\n'), /ALTER TABLE discord_guild_channels ADD COLUMN channel_type/i);
});
