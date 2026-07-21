const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ConnectionInputError,
  normalizeConnectionInput,
  normalizeTargetUrl,
} = require('../src/services/connection_validation');

test('normalizes a valid connection and removes duplicate access IDs', () => {
  const result = normalizeConnectionInput({
    name: ' Internal Dashboard ',
    slug: 'Internal-Dashboard',
    target_url: 'http://localhost:8080/app',
    description: ' Operations ',
    enabled: true,
    hidden: true,
    role_ids: [2, '2', 3],
    user_ids: ['abc_123', 'abc_123'],
  });

  assert.deepEqual(result, {
    name: 'Internal Dashboard',
    slug: 'internal-dashboard',
    target_url: 'http://localhost:8080/app/',
    description: 'Operations',
    enabled: true,
    hidden: true,
    role_ids: [2, 3],
    user_ids: ['abc_123'],
  });
});

test('rejects unsafe or ambiguous target URLs', () => {
  const invalidUrls = [
    'ftp://localhost/files',
    'http://user:password@localhost/',
    'http://localhost/?token=secret',
    'http://localhost/#section',
    'not-a-url',
  ];

  for (const value of invalidUrls) {
    assert.throws(() => normalizeTargetUrl(value), ConnectionInputError);
  }
});

test('rejects invalid slugs and access IDs', () => {
  const base = {
    name: 'Dashboard',
    slug: 'dashboard',
    target_url: 'https://internal.example/',
  };

  assert.throws(
    () => normalizeConnectionInput({ ...base, slug: '../admin' }),
    /Slug may only contain/
  );
  assert.throws(
    () => normalizeConnectionInput({ ...base, role_ids: [0] }),
    /invalid ID/
  );
  assert.throws(
    () => normalizeConnectionInput({ ...base, user_ids: ['bad/id'] }),
    /invalid ID/
  );
});
