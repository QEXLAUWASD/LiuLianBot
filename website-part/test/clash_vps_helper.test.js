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
