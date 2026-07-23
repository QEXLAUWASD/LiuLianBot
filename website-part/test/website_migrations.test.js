const test = require('node:test');
const assert = require('node:assert/strict');
const { runMigrations } = require('../src/db/migrate');

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
