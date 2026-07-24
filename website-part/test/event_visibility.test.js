const test = require('node:test');
const assert = require('node:assert/strict');

test('event migration adds visible flag with public default', async () => {
  const { MIGRATIONS } = require('../src/db/migrate');
  const migration = MIGRATIONS.find(item => item.version === '005');
  assert.ok(migration);
  const statements = [];
  await migration.up({ execute: async sql => { statements.push(sql); return [[]]; } });
  assert.match(statements.join('\n'), /website_events ADD COLUMN visible/i);
});

test('admin event visibility validation accepts only booleans', () => {
  const { normalizeEventVisibility } = require('../src/services/event_visibility_validation');
  assert.equal(normalizeEventVisibility(true), true);
  assert.throws(() => normalizeEventVisibility('true'), /boolean/);
});
