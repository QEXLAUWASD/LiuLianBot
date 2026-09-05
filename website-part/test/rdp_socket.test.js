const test = require('node:test');
const assert = require('node:assert/strict');
const { errorPayload, screenSize } = require('../src/rdp_socket');

test('WebRDP screen sizes stay within browser and RDP bounds', () => {
  assert.deepEqual(screenSize({ width: 1280, height: 720 }), { width: 1280, height: 720 });
  assert.throws(() => screenSize({ width: 639, height: 720 }));
  assert.throws(() => screenSize({ width: 1280, height: 2161 }));
});

test('WebRDP errors sent to the browser have a bounded payload', () => {
  assert.deepEqual(errorPayload({ code: 'ERR_CONNECT', message: 'Connection refused' }), {
    code: 'ERR_CONNECT', message: 'Connection refused',
  });
  assert.equal(errorPayload({ message: 'x'.repeat(301) }).message, 'RDP connection failed');
});

const { resolveConnection } = require('../src/rdp_socket');
const connection = host => ({ host, username: 'test-user', password: 'test-only' });

test('RDP permits an explicitly allowlisted private IP', async () => {
  const result = await resolveConnection(connection('192.168.0.10'), new Set(['192.168.0.10']));
  assert.equal(result.address, '192.168.0.10');
});
test('RDP permits private addresses in canonical and host-bit CIDR entries', async () => {
  for (const cidr of ['192.168.0.0/24', '192.168.0.1/24']) {
    const result = await resolveConnection(connection('192.168.0.42'), new Set([cidr]));
    assert.equal(result.address, '192.168.0.42');
  }
});
test('RDP still rejects private addresses when the allowlist is empty', async () => {
  await assert.rejects(resolveConnection(connection('192.168.0.42'), new Set()), /Private or unresolved/);
});
test('RDP rejects a private address outside the configured subnet', async () => {
  await assert.rejects(resolveConnection(connection('192.168.1.42'), new Set(['192.168.0.0/24'])), /not permitted/);
});
test('RDP preserves public destination access with an empty allowlist', async () => {
  const result = await resolveConnection(connection('8.8.8.8'), new Set());
  assert.equal(result.address, '8.8.8.8');
});
test('shared resolver keeps rejecting private SSH destinations by default', async () => {
  const { assertResolvedRemoteHost } = require('../src/services/remote_validation');
  await assert.rejects(assertResolvedRemoteHost('192.168.0.42', new Set(['192.168.0.0/24'])), /Private or unresolved/);
});
