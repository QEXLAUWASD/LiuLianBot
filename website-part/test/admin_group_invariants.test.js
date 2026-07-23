const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGroupInput } = require('../src/services/group_validation');

test('create and update share group limits', () => {
  assert.deepEqual(
    normalizeGroupInput({ name: ' Moderators ', description: ' Staff ' }),
    { name: 'Moderators', description: 'Staff' }
  );
  assert.throws(() => normalizeGroupInput({ name: 'x'.repeat(51) }), /50/);
  assert.throws(
    () => normalizeGroupInput({ name: 'ok', description: 42 }),
    /string/
  );
  assert.throws(
    () => normalizeGroupInput({ name: 'ok', description: 'x'.repeat(256) }),
    /255/
  );
});
