const test = require('node:test');
const assert = require('node:assert/strict');
const { groupBy } = require('../src/db/connections');

test('groupBy builds one lookup list per connection', () => {
  const grouped = groupBy([
    { connection_id: 2, id: 10 },
    { connection_id: 1, id: 11 },
    { connection_id: 2, id: 12 },
  ], 'connection_id');

  assert.deepEqual(grouped.get(2).map(item => item.id), [10, 12]);
  assert.deepEqual(grouped.get(1).map(item => item.id), [11]);
});
