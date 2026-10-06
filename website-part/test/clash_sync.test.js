const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncWorker } = require('../src/services/clash_sync');
const { decryptProfile } = require('../src/services/remote_profile_crypto');
const key = Buffer.alloc(32, 7);
const server = { id: 1, enabled: 1, management_profile: 'vps', proxy_json: JSON.stringify({ type: 'hysteria2', password: 'shared' }) };

function fixture({ nodes = [server], users = [{ user_id: 'user', expires_at: new Date('2099-01-01') }], transport = async () => {}, acquired = 1, profileStyle = () => 'hysteria2-userpass' } = {}) {
  const calls = [];
  const stored = new Map();
  const conn = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      if (sql.includes('GET_LOCK')) return [[{ acquired }]];
      if (sql.startsWith('SELECT * FROM website_clash_servers')) return [nodes];
      if (sql.includes('SELECT s.user_id')) return [users];
      if (sql.startsWith('SELECT credential_encrypted')) return [stored.has(params[1]) ? [{ credential_encrypted: stored.get(params[1]) }] : []];
      if (sql.startsWith('INSERT INTO website_clash_accounts') && !stored.has(params[1])) stored.set(params[1], params[2]);
      if (sql.startsWith('UPDATE website_clash_accounts SET applied=1')) stored.set(params[2], params[0]);
      return [{ affectedRows: 1 }];
    },
    beginTransaction: async () => calls.push(['begin']), commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']), release: () => calls.push(['release']),
  };
  const worker = createSyncWorker({ poolProvider: async () => ({ getConnection: async () => conn }),
    transport, profilesProvider: () => ({ vps: { credential_style: profileStyle() } }),
    env: { CLASH_CREDENTIAL_ENCRYPTION_KEY: key.toString('base64') } });
  return { calls, stored, worker };
}

test('worker publishes encrypted per-user credentials only after successful SSH apply', async () => {
  const messages = [];
  const f = fixture({ transport: async (profile, payload) => messages.push(payload) });
  await f.worker.runOnce();
  const account = decryptProfile(f.stored.get('user'), key);
  assert.notEqual(account.password, 'shared');
  assert.equal(JSON.parse(account.proxy_json).password, `${account.name}:${account.password}`);
  assert.equal(messages[0].accounts[0].password, account.password);
  assert.equal(Object.hasOwn(messages[0].accounts[0], 'proxy_json'), false);
  assert.ok(f.calls.some(([sql]) => sql.startsWith('UPDATE website_clash_accounts SET applied=1')));
  await f.worker.runOnce();
  assert.equal(decryptProfile(f.stored.get('user'), key).password, account.password);
  assert.ok(f.calls.some(([sql]) => sql.includes('RELEASE_LOCK')));
  assert.equal(f.calls.at(-1)[0], 'release');
});

test('expired/deleted users and disabled/deleted nodes send empty desired account lists', async () => {
  for (const options of [{ users: [] }, { nodes: [{ ...server, enabled: 0 }] }, { nodes: [{ ...server, deleted_at: new Date() }] }]) {
    const messages = [];
    const f = fixture({ ...options, transport: async (profile, payload) => messages.push(payload) });
    await f.worker.runOnce();
    assert.deepEqual(messages[0].accounts, []);
    assert.ok(f.calls.some(([sql]) => sql === 'UPDATE website_clash_accounts SET applied=0 WHERE server_id=?'));
    assert.equal(f.calls.some(([sql]) => sql.startsWith('UPDATE website_clash_accounts SET applied=1')), false);
  }
});

test('SSH failure stays unpublished, records a sanitized failure, and retries the same credential', async () => {
  let attempts = 0;
  const f = fixture({ transport: async () => { if (++attempts === 1) throw new Error('SECRET_PASSWORD'); } });
  await f.worker.runOnce();
  assert.equal(f.calls.some(([sql]) => sql.startsWith('UPDATE website_clash_accounts SET applied=1')), false);
  const error = f.calls.find(([sql]) => sql.includes("sync_status='error'"));
  assert.doesNotMatch(error[1][0], /SECRET_PASSWORD/);
  const credential = decryptProfile(f.stored.get('user'), key).password;
  await f.worker.runOnce();
  assert.equal(attempts, 2);
  assert.equal(decryptProfile(f.stored.get('user'), key).password, credential);
  assert.ok(f.calls.some(([sql]) => sql.startsWith('UPDATE website_clash_accounts SET applied=1')));
});

test('multiple website workers cannot synchronize concurrently without the database lock', async () => {
  const f = fixture({ acquired: 0 });
  await f.worker.runOnce();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls.at(-1)[0], 'release');
});

test('a failed SSH update preserves the last acknowledged encrypted proxy until remote acceptance', async () => {
  let style = 'standard'; let fail = false;
  const f = fixture({ profileStyle: () => style, transport: async () => { if (fail) throw new Error('rejected'); } });
  await f.worker.runOnce();
  const acknowledged = f.stored.get('user');
  style = 'hysteria2-userpass'; fail = true;
  await f.worker.runOnce();
  assert.equal(f.stored.get('user'), acknowledged);
  fail = false;
  await f.worker.runOnce();
  const account = decryptProfile(f.stored.get('user'), key);
  assert.equal(JSON.parse(account.proxy_json).password, `${account.name}:${account.password}`);
});
