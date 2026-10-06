const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { synchronize } = require('../deploy/clash-vps/sync');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-vps-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = { engine: 'xray', protocol: 'vless', owner_prefix: 'llb-s1-', inbound_tag: 'vpn',
    config_path: path.join(directory, 'config.json'), binary: '/fake/xray', service: 'xray.service' };
  const original = JSON.stringify({ inbounds: [{ tag: 'vpn', protocol: 'vless', settings: { clients: [] } }] });
  fs.writeFileSync(target.config_path, original, { mode: 0o640 });
  const payload = { owner_prefix: target.owner_prefix, accounts: [{ name: 'llb-s1-' + 'a'.repeat(24), type: 'vless', uuid: '00000000-0000-0000-0000-000000000001', expires_at: '2099-01-01T00:00:00Z' }] };
  return { target, original, payload, state: path.join(directory, 'state.json') };
}

test('VPS helper validates before writing and persists local expiry without redundant restart', t => {
  const f = fixture(t); const calls = [];
  const options = { validate: () => {}, runCommand: (binary, args) => calls.push([binary, args]) };
  synchronize(f.target, f.payload, f.state, options);
  assert.equal(calls[0][1][1], '-test');
  assert.equal(calls.filter(call => call[1][0] === 'restart').length, 1);
  assert.equal(fs.statSync(f.target.config_path).mode & 0o777, 0o640);
  assert.equal(fs.statSync(f.state).mode & 0o777, 0o600);
  calls.length = 0;
  const extended = { ...f.payload, accounts: f.payload.accounts.map(account => ({ ...account, expires_at: '2099-02-01T00:00:00Z' })) };
  synchronize(f.target, extended, f.state, options);
  assert.equal(calls.length, 0);
  assert.equal(JSON.parse(fs.readFileSync(f.state)).accounts[0].expires_at, '2099-02-01T00:00:00Z');
});

test('failed config validation leaves the VPN file untouched', t => {
  const f = fixture(t);
  assert.throws(() => synchronize(f.target, f.payload, f.state, { validate: () => {}, runCommand: () => { throw new Error('invalid'); } }));
  assert.equal(fs.readFileSync(f.target.config_path, 'utf8'), f.original);
  assert.equal(fs.existsSync(f.state), false);
});

test('failed service restart restores the original configuration and never acknowledges applied state', t => {
  const f = fixture(t); let restarts = 0;
  assert.throws(() => synchronize(f.target, f.payload, f.state, { validate: () => {}, runCommand: (binary, args) => {
    if (args[0] === 'restart' && ++restarts === 1) throw new Error('failed');
  } }));
  assert.equal(fs.readFileSync(f.target.config_path, 'utf8'), f.original);
  assert.equal(restarts, 2);
  assert.equal(fs.existsSync(f.state), false);
});

const yaml = require('js-yaml');
const { applyAccounts } = require('../deploy/clash-vps/config_accounts');
const { serviceCommand, expiryCommand } = require('../deploy/clash-vps/services');
const { createExpiryDaemon } = require('../deploy/clash-vps/expire-daemon');

test('Mihomo expires only owned Hysteria2 passwords and uses standard client credentials', () => {
  const target = { engine: 'mihomo', protocol: 'hysteria2', inbound_tag: 'hy', owner_prefix: 'llb-s1-' };
  const name = 'llb-s1-' + 'a'.repeat(24);
  const source = { listeners: [{ name: 'hy', type: 'hysteria2', users: { legacy: 'keep', [name]: 'old' }, certificate: '/cert' }] };
  const payload = { owner_prefix: target.owner_prefix, accounts: [{ name, type: 'hysteria2', password: 'individual', expires_at: '2099-01-01T00:00:00Z' }] };
  const active = applyAccounts(source, target, payload);
  assert.deepEqual(active.listeners[0].users, { legacy: 'keep', [name]: 'individual' });
  const expired = applyAccounts(active, target, payload, Date.parse('2100-01-01'));
  assert.deepEqual(expired.listeners[0].users, { legacy: 'keep' });
  assert.equal(expired.listeners[0].certificate, '/cert');
  assert.equal(source.listeners[0].users[name], 'old');
  assert.throws(() => applyAccounts(source, target, { ...payload, credential_style: 'hysteria2-userpass' }));
});

test('Mihomo VLESS preserves Reality and unrelated users; expiry sentinel stays stable', () => {
  const target = { engine: 'mihomo', protocol: 'vless', inbound_tag: 'vl', owner_prefix: 'llb-s1-' };
  const source = { listeners: [{ name: 'vl', type: 'vless', users: [], 'reality-config': { dest: 'example.com:443' } }] };
  const payload = { owner_prefix: target.owner_prefix, accounts: [{ name: 'llb-s1-' + 'a'.repeat(24), type: 'vless', uuid: '00000000-0000-0000-0000-000000000001', flow: 'xtls-rprx-vision', expires_at: '2099-01-01T00:00:00Z' }] };
  const active = applyAccounts(source, target, payload);
  assert.equal(active.listeners[0].users[0].username, payload.accounts[0].name);
  assert.equal(active.listeners[0].users[0].flow, 'xtls-rprx-vision');
  assert.deepEqual(active.listeners[0]['reality-config'], source.listeners[0]['reality-config']);
  const revoked = applyAccounts(active, target, { ...payload, accounts: [] });
  assert.equal(revoked.listeners[0].users[0].username, 'llb-s1-disabled');
  assert.deepEqual(applyAccounts(revoked, target, { ...payload, accounts: [] }), revoked);
  assert.throws(() => applyAccounts(source, { ...target, inbound_tag: 'missing' }, payload));
  assert.throws(() => applyAccounts(source, { ...target, protocol: 'ss' }, { ...payload, accounts: [] }));
});

test('Mihomo validates candidate YAML before activation and rolls back via procd', t => {
  const f = fixture(t);
  Object.assign(f.target, { engine: 'mihomo', service_manager: 'procd', service: 'mihomo', inbound_tag: 'vpn' });
  f.original = yaml.dump({ listeners: [{ name: 'vpn', type: 'vless', users: [] }] });
  fs.writeFileSync(f.target.config_path, f.original);
  const calls = [];
  assert.throws(() => synchronize(f.target, f.payload, f.state, { validate: () => {}, runCommand: (binary, args) => {
    calls.push([binary, args]);
    if (args[0] === 'running') throw new Error('service failed');
  } }));
  assert.deepEqual(calls[0][1], ['-t', '-d', path.dirname(f.target.config_path), '-f', f.target.config_path + '.llb-candidate']);
  assert.deepEqual(calls.slice(1), [['/etc/init.d/mihomo', ['restart']], ['/etc/init.d/mihomo', ['running']], ['/etc/init.d/mihomo', ['restart']]]);
  assert.equal(fs.readFileSync(f.target.config_path, 'utf8'), f.original);
  assert.equal(fs.existsSync(f.state), false);
});

test('service manager rejects unsafe paths and detects OpenWrt expiry service', () => {
  assert.deepEqual(serviceCommand({ service: 'mihomo.service' }, 'running').args, ['is-active', '--quiet', 'mihomo.service']);
  assert.deepEqual(expiryCommand(() => true), { binary: '/etc/init.d/liulian-vpn-expire', args: ['running'] });
  assert.equal(expiryCommand(() => false).args[2], 'liulian-vpn-expire.timer');
  for (const service of ['../evil', 'mihomo;id', '-evil']) assert.throws(() => serviceCommand({ service_manager: 'procd', service }, 'restart'));
  assert.throws(() => serviceCommand({ service_manager: 'unknown', service: 'mihomo' }, 'restart'));
});

test('expiry daemon avoids overlapping cleanup, reports sanitized failures and stops its child', () => {
  let callback; let count = 0; let killed; const logs = [];
  const daemon = createExpiryDaemon({ execute: (binary, args, options, done) => {
    assert.equal(binary, '/usr/local/libexec/liulian-vpn-sync');
    assert.deepEqual(args, ['--expire']);
    callback = done; count++;
    return { kill: signal => { killed = signal; } };
  }, log: (...args) => logs.push(args) });
  daemon.start(); daemon.tick(); assert.equal(count, 1);
  callback(new Error('secret'), '{"success":false}');
  assert.deepEqual(logs, [[]]);
  daemon.tick(); assert.equal(count, 2);
  daemon.stop(); assert.equal(killed, 'SIGTERM');
  daemon.tick(); assert.equal(count, 2);
});
