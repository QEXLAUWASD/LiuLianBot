const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RemoteInputError,
  normalizeRdpInput,
  assertAllowedSshHost,
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

test('RDP files include only supplied safe connection values', () => {
  const file = rdpFile({ host: 'server.example.com', port: 3390, username: 'admin', domain: 'CONTOSO' });
  assert.match(file, /full address:s:server\.example\.com:3390/);
  assert.match(file, /domain:s:CONTOSO/);
  assert.match(file, /username:s:admin/);
});
