const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptProfile, decryptProfile, encryptionKey } = require('../src/services/remote_profile_crypto');
const { normalizeRemoteProfile } = require('../src/services/remote_profile_validation');
const { RemoteInputError } = require('../src/services/remote_validation');

test('encrypts remote profiles with authenticated AES-256-GCM encryption', () => {
  const key = Buffer.alloc(32, 7);
  const profile = { ssh: { host: 'server.example.com', privateKey: 'private' }, rdp: null };
  const encrypted = encryptProfile(profile, key);
  assert.doesNotMatch(encrypted, /private/);
  assert.deepEqual(decryptProfile(encrypted, key), profile);
  const parts = encrypted.split('.');
  parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
  assert.throws(() => decryptProfile(parts.join('.'), key));
});

test('accepts only a base64 32-byte server encryption key', () => {
  assert.equal(encryptionKey(Buffer.alloc(32, 1).toString('base64')).length, 32);
  assert.equal(encryptionKey('not-a-key'), null);
});

test('stored remote profiles exclude passwords and validate their safe fields', () => {
  assert.deepEqual(normalizeRemoteProfile({
    ssh: { host: 'server.example.com', port: '22', username: 'root', privateKey: 'key' },
    rdp: { host: 'desktop.example.com', port: 3389, username: 'admin', domain: '' },
  }), {
    ssh: { host: 'server.example.com', port: 22, username: 'root', privateKey: 'key' },
    rdp: { host: 'desktop.example.com', port: 3389, username: 'admin', domain: '' },
  });
  assert.throws(() => normalizeRemoteProfile({ ssh: { host: 'x', username: 'u', privateKey: 'x'.repeat(16385) } }), RemoteInputError);
});
