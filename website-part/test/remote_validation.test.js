const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RemoteInputError,
  normalizeRdpInput,
  assertAllowedSshHost,
  cidrMatches,
} = require('../src/services/remote_validation');
const { rdpFile } = require('../src/routes/rdp');

test('normalizes RDP connection details and rejects line injection', () => {
  assert.deepEqual(normalizeRdpInput({
    host: ' Windows.Example.com ', port: '3389', username: ' administrator ', domain: ' CONTOSO ',
  }), {
    host: 'Windows.Example.com', port: 3389, username: 'administrator', domain: 'CONTOSO',
  });
  assert.throws(
    () => normalizeRdpInput({ host: 'server\r\nusername:s:attacker', username: 'admin' }),
    RemoteInputError
  );
});

test('SSH host allow list only permits configured hosts', () => {
  const allowed = new Set(['server.example.com']);
  assert.doesNotThrow(() => assertAllowedSshHost('SERVER.EXAMPLE.COM', allowed));
  assert.throws(() => assertAllowedSshHost('other.example.com', allowed), RemoteInputError);
});

test('SSH host allow list supports IPv4 CIDR ranges for server local networks', () => {
  assert.equal(cidrMatches('192.168.50.24', '192.168.50.0/24'), true);
  assert.equal(cidrMatches('192.168.51.24', '192.168.50.0/24'), false);
  assert.doesNotThrow(() => assertAllowedSshHost('10.20.30.40', new Set(['10.0.0.0/8'])));
});

test('RDP files include only supplied safe connection values', () => {
  const file = rdpFile({ host: 'server.example.com', port: 3390, username: 'admin', domain: 'CONTOSO' });
  assert.match(file, /full address:s:server\.example\.com:3390/);
  assert.match(file, /domain:s:CONTOSO/);
  assert.match(file, /username:s:admin/);
});
