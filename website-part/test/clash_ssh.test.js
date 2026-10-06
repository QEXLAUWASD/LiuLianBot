const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAccount, accountProxy, profileOptions, syncOverSsh } = require('../src/services/clash_ssh');
const { applyAccounts } = require('../deploy/clash-vps/config_accounts');
const uuid = '00000000-0000-0000-0000-000000000001';
const user = { name: 'llb-s1-' + 'a'.repeat(24), type: 'hysteria2', password: 'unique-password', expires_at: '2099-01-01T00:00:00Z' };
const profile = { host: 'localhost', username: 'manager', host_fingerprint: 'a'.repeat(64), target: 'hy2', password_env: 'SSH_TEST_PASSWORD' };

test('managed users have independent credentials; standalone Hysteria and SS2022 formats are correct', () => {
  const server = { id: 1, proxy_json: JSON.stringify({ type: 'hysteria2', password: 'shared' }) };
  const first = createAccount(server, 'one'); const second = createAccount(server, 'two');
  assert.notEqual(first.password, second.password);
  assert.notEqual(first.name, second.name);
  assert.equal(JSON.parse(accountProxy(server, first, 'hysteria2-userpass')).password, `${first.name}:${first.password}`);
  assert.equal(JSON.parse(accountProxy(server, first)).password, first.password);
  const ss = { id: 2, proxy_json: JSON.stringify({ type: 'ss', cipher: '2022-blake3-aes-128-gcm', password: 'base-key:old-user' }) };
  const account = createAccount(ss, 'one');
  assert.equal(Buffer.from(account.password, 'base64').length, 16);
  assert.equal(JSON.parse(accountProxy(ss, account)).password, `base-key:${account.password}`);
});

test('standalone Hysteria removes expired owned users and preserves unrelated accounts', () => {
  const target = { engine: 'hysteria2', protocol: 'hysteria2', owner_prefix: 'llb-s1-' };
  const source = { auth: { type: 'userpass', userpass: { admin: 'keep', [user.name]: 'old' } }, tls: { cert: '/keep' } };
  const payload = { owner_prefix: 'llb-s1-', credential_style: 'hysteria2-userpass', accounts: [user] };
  const enabled = applyAccounts(source, target, payload);
  assert.equal(enabled.auth.userpass[user.name], user.password);
  const expired = applyAccounts(enabled, target, payload, Date.parse('2100-01-01'));
  assert.deepEqual(expired.auth.userpass, { admin: 'keep' });
  assert.deepEqual(expired.tls, source.tls);
  assert.equal(source.auth.userpass[user.name], 'old');
  assert.throws(() => applyAccounts({ auth: { type: 'password', password: 'shared' } }, target, payload));
  assert.throws(() => applyAccounts(source, target, { ...payload, owner_prefix: 'llb-s2-' }));
  assert.throws(() => applyAccounts(source, target, { ...payload, credential_style: 'standard' }));
});

test('sing-box and Xray modify only the selected inbound and managed user namespace', () => {
  for (const engine of ['sing-box', 'xray']) {
    const target = { engine, protocol: 'vless', owner_prefix: 'llb-s1-', inbound_tag: 'vpn' };
    const accounts = [{ ...user, type: 'vless', uuid, flow: 'xtls-rprx-vision' }];
    const unrelated = { tag: 'other', type: 'direct' };
    const source = { inbounds: [engine === 'sing-box' ? { tag: 'vpn', type: 'vless', users: [{ name: 'manual', uuid }] }
      : { tag: 'vpn', protocol: 'vless', settings: { clients: [{ email: 'manual', id: uuid }] } }, unrelated] };
    const result = applyAccounts(source, target, { owner_prefix: target.owner_prefix, accounts });
    assert.deepEqual(result.inbounds[1], unrelated);
    const entries = engine === 'sing-box' ? result.inbounds[0].users : result.inbounds[0].settings.clients;
    assert.equal(entries.length, 2);
    assert.equal(entries[1].flow, 'xtls-rprx-vision');
    const revoked = applyAccounts(result, target, { owner_prefix: target.owner_prefix, accounts: [] });
    assert.equal((engine === 'sing-box' ? revoked.inbounds[0].users : revoked.inbounds[0].settings.clients).length, 1);
  }
});

test('SS2022 validates the base key and uses stable inaccessible sentinel with no granted users', () => {
  const target = { engine: 'sing-box', protocol: 'ss', owner_prefix: 'llb-s1-', inbound_tag: 'ss' };
  const source = { inbounds: [{ type: 'shadowsocks', tag: 'ss', method: '2022-blake3-aes-128-gcm', password: 'base', users: [] }] };
  const payload = { owner_prefix: target.owner_prefix, accounts: [] };
  const empty = applyAccounts(source, target, payload);
  assert.equal(empty.inbounds[0].users.length, 1);
  assert.deepEqual(applyAccounts(empty, target, payload), empty);
  assert.throws(() => applyAccounts(source, target, { ...payload, accounts: [{ ...user, type: 'ss', cipher: '2022-blake3-aes-128-gcm', server_password: 'wrong' }] }));
});

test('SSH transport pins host keys, passes payload via stdin and reports only acknowledged success', async () => {
  let command, sent;
  const client = new EventEmitter();
  client.end = () => {};
  client.connect = options => {
    assert.equal(options.hostVerifier('b'.repeat(64)), false);
    assert.equal(options.hostVerifier('a'.repeat(64)), true);
    queueMicrotask(() => client.emit('ready'));
  };
  client.exec = (value, callback) => {
    command = value;
    const stream = new EventEmitter(); stream.stderr = new EventEmitter();
    stream.end = value => { sent = JSON.parse(value); queueMicrotask(() => { stream.emit('data', '{"success":true}'); stream.emit('close', 0); }); };
    callback(null, stream);
  };
  await syncOverSsh(profile, { owner_prefix: 'llb-s1-', accounts: [user] }, { env: { SSH_TEST_PASSWORD: 'test' }, clientFactory: () => client });
  assert.equal(command, 'sudo -n /usr/local/libexec/liulian-vpn-sync');
  assert.equal(sent.target, 'hy2');
  assert.equal(sent.accounts[0].password, user.password);
  assert.throws(() => profileOptions({ ...profile, host_fingerprint: '' }, { SSH_TEST_PASSWORD: 'test' }));
});

test('SSH failure does not disclose remote credentials and timeout terminates the connection', async () => {
  let ended = false;
  const client = new EventEmitter(); client.connect = () => {};
  client.end = () => { ended = true; };
  await assert.rejects(syncOverSsh(profile, {}, { env: { SSH_TEST_PASSWORD: 'SECRET' }, timeout: 5, clientFactory: () => client }), error => {
    assert.doesNotMatch(error.message, /SECRET/); return true;
  });
  assert.equal(ended, true);
});
