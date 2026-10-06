const test = require('node:test');
const assert = require('node:assert/strict');
let execute;
let calls;
const conn = {
  beginTransaction: async () => calls.push('begin'),
  execute: async (sql, params) => { calls.push([sql, params]); return execute(sql, params); },
  commit: async () => calls.push('commit'),
  rollback: async () => calls.push('rollback'),
  release: () => calls.push('release'),
};
const poolPath = require.resolve('../src/db/pool');
require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true,
  exports: { getPool: async () => ({ getConnection: async () => conn, execute: conn.execute }) } };
const repository = require('../src/db/clash');
const data = { enabled: true, expires_at: new Date('2099-01-01T00:00:00Z'), server_ids: [1, 2] };

test('subscription grant replacement locks the user, preserves token and commits atomically', async () => {
  calls = [];
  execute = async sql => sql.startsWith('SELECT id') ? [[{ id: 'u' }]] : [{}];
  await repository.saveSubscription('u', data);
  assert.equal(calls[0], 'begin');
  assert.match(calls[1][0], /FOR UPDATE/);
  const upsert = calls.find(call => Array.isArray(call) && call[0].includes('ON DUPLICATE KEY'));
  assert.match(upsert[1][1], /^[a-f0-9]{64}$/);
  assert.doesNotMatch(upsert[0].split('ON DUPLICATE KEY UPDATE')[1], /token/);
  assert.equal(calls.filter(call => Array.isArray(call) && call[0].startsWith('INSERT INTO website_clash_grants')).length, 2);
  assert.deepEqual(calls.slice(-2), ['commit', 'release']);
});

test('invalid VPN grant rolls back subscription and grants, and releases connection', async () => {
  calls = [];
  execute = async sql => {
    if (sql.startsWith('SELECT id')) return [[{ id: 'u' }]];
    if (sql.startsWith('INSERT INTO website_clash_grants')) throw Object.assign(new Error('missing node'), { code: 'ER_NO_REFERENCED_ROW_2' });
    return [{}];
  };
  await assert.rejects(repository.saveSubscription('u', data), { code: 'ER_NO_REFERENCED_ROW_2' });
  assert.equal(calls.includes('commit'), false);
  assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
});

test('unknown user does not create a subscription', async () => {
  calls = [];
  execute = async () => [[]];
  await assert.rejects(repository.saveSubscription('missing', data), { statusCode: 404 });
  assert.equal(calls.filter(Array.isArray).length, 1);
  assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
});

test('download query checks UTC expiry and filters disabled nodes in one statement', async () => {
  calls = [];
  execute = async (sql, params) => {
    assert.match(sql, /s\.expires_at>UTC_TIMESTAMP\(\)/);
    assert.match(sql, /s\.enabled=1/);
    assert.match(sql, /v\.enabled=1/);
    assert.match(sql, /g\.user_id=s\.user_id/);
    assert.deepEqual(params, ['a'.repeat(64)]);
    return [[{ expires_at: data.expires_at, id: null, name: null, proxy_json: null }]];
  };
  const result = await repository.getSubscription('a'.repeat(64));
  assert.deepEqual(result, { expires_at: data.expires_at, servers: [] });
  assert.equal(calls.length, 1);
});

test('migration 020 creates unique token and cascading user/server grants', async () => {
  const { MIGRATIONS } = require('../src/db/migrate');
  const statements = [];
  await MIGRATIONS.find(m => m.version === '020').up({ execute: async sql => statements.push(sql) });
  assert.equal(statements.length, 3);
  assert.match(statements[1], /token CHAR\(64\).*ascii_bin NOT NULL UNIQUE/);
  assert.match(statements[1], /REFERENCES website_users\(id\) ON DELETE CASCADE/);
  assert.match(statements[2], /PRIMARY KEY \(user_id, server_id\)/);
  assert.match(statements[2], /REFERENCES website_clash_servers\(id\) ON DELETE CASCADE/);
});

test('managed downloads require an acknowledged account and never disclose the shared base credential', async t => {
  const { encryptProfile } = require('../src/services/remote_profile_crypto');
  const key = Buffer.alloc(32, 5);
  const previous = process.env.CLASH_CREDENTIAL_ENCRYPTION_KEY;
  process.env.CLASH_CREDENTIAL_ENCRYPTION_KEY = key.toString('base64');
  t.after(() => { if (previous === undefined) delete process.env.CLASH_CREDENTIAL_ENCRYPTION_KEY; else process.env.CLASH_CREDENTIAL_ENCRYPTION_KEY = previous; });
  const row = { expires_at: data.expires_at, id: 1, name: 'VPN', management_profile: 'vps', sync_status: 'pending',
    applied: 0, proxy_json: '{"password":"SHARED"}', credential_encrypted: encryptProfile({ proxy_json: '{"password":"INDIVIDUAL"}' }, key) };
  calls = [];
  execute = async () => [[row]];
  assert.deepEqual((await repository.getSubscription('token')).servers, []);
  row.sync_status = 'ready';
  assert.deepEqual((await repository.getSubscription('token')).servers, []);
  row.applied = 1;
  assert.equal(JSON.parse((await repository.getSubscription('token')).servers[0].proxy_json).password, 'INDIVIDUAL');
  row.sync_status = 'error';
  assert.deepEqual((await repository.getSubscription('token')).servers, []);
});

test('subscription deletion locks the user and retains individual account records for SSH revocation', async () => {
  calls = [];
  execute = async sql => sql.startsWith('SELECT id') ? [[{ id: 'u' }]] : [{ affectedRows: 1 }];
  await repository.deleteSubscription('u');
  assert.equal(calls[0], 'begin');
  assert.match(calls[1][0], /website_clash_users.*FOR UPDATE/);
  assert.deepEqual(calls[2], ['DELETE FROM website_clash_subscriptions WHERE user_id=?', ['u']]);
  assert.deepEqual(calls.slice(-2), ['commit', 'release']);
  assert.equal(calls.some(call => Array.isArray(call) && /DELETE FROM website_(users|clash_accounts)/.test(call[0])), false);
});

test('missing subscription deletion rolls back and releases its transaction', async () => {
  calls = [];
  execute = async sql => sql.startsWith('SELECT id') ? [[{ id: 'u' }]] : [{ affectedRows: 0 }];
  await assert.rejects(repository.deleteSubscription('u'), { statusCode: 404 });
  assert.equal(calls.includes('commit'), false);
  assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
});

test('independent VPN user creation uses its own UUID and commits user/subscription/grants together', async () => {
  calls = [];
  execute = async () => [{ affectedRows: 1 }];
  const id = await repository.saveSubscription(null, { ...data, username: 'VPN customer' });
  assert.match(id, /^[a-f0-9-]{36}$/);
  const user = calls.find(call => Array.isArray(call) && call[0].startsWith('INSERT INTO website_clash_users'));
  assert.deepEqual(user[1], [id, 'VPN customer']);
  assert.equal(calls.some(call => Array.isArray(call) && /website_users\b/.test(call[0])), false);
  assert.deepEqual(calls.slice(-2), ['commit', 'release']);
});

test('failed independent VPN creation rolls back the identity as well as the subscription', async () => {
  calls = [];
  execute = async sql => {
    if (sql.startsWith('INSERT INTO website_clash_grants')) throw new Error('invalid grant');
    return [{ affectedRows: 1 }];
  };
  await assert.rejects(repository.saveSubscription(null, { ...data, username: 'VPN customer' }));
  assert.equal(calls.includes('commit'), false);
  assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
});

test('migration 022 preserves existing VPN identities and replaces only the website-user foreign key', async () => {
  const { MIGRATIONS } = require('../src/db/migrate');
  for (const keys of [[{ CONSTRAINT_NAME: 'old_user_fk', REFERENCED_TABLE_NAME: 'website_users' }],
    [{ CONSTRAINT_NAME: 'fk_clash_subscription_vpn_user', REFERENCED_TABLE_NAME: 'website_clash_users' }], []]) {
    const statements = [];
    await MIGRATIONS.find(m => m.version === '022').up({ execute: async sql => {
      statements.push(sql);
      return sql.includes('information_schema.KEY_COLUMN_USAGE') ? [keys] : [{ affectedRows: 1 }];
    } });
    assert.match(statements[1], /SELECT s.user_id, LEFT\(u.username,100\)/);
    assert.equal(statements.some(sql => /UPDATE website_clash_(subscriptions|accounts|grants)|DELETE FROM/.test(sql)), false);
    assert.equal(statements.some(sql => sql.includes('DROP FOREIGN KEY')), keys.some(key => key.REFERENCED_TABLE_NAME === 'website_users'));
    assert.equal(statements.some(sql => sql.includes('ADD CONSTRAINT')), !keys.some(key => key.REFERENCED_TABLE_NAME === 'website_clash_users'));
  }
});

test('VPN rename locks the independent identity and preserves existing subscription tokens', async () => {
  calls = [];
  execute = async sql => sql.startsWith('SELECT id') ? [[{ id: 'u' }]] : [{ affectedRows: 1 }];
  await repository.saveSubscription('u', { ...data, username: 'Renamed VPN user' });
  assert.match(calls[1][0], /website_clash_users.*FOR UPDATE/);
  assert.deepEqual(calls[2], ['UPDATE website_clash_users SET username=? WHERE id=?', ['Renamed VPN user', 'u']]);
  const upsert = calls.find(call => Array.isArray(call) && call[0].includes('ON DUPLICATE KEY'));
  assert.doesNotMatch(upsert[0].split('ON DUPLICATE KEY UPDATE')[1], /token/);
});
