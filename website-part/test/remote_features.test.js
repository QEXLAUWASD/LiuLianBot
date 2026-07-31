const test = require('node:test');
const assert = require('node:assert/strict');
const { remoteFeatures } = require('../src/services/remote_features');

test('remote features default to enabled and accept explicit hoster disable switches', () => {
  assert.deepEqual(remoteFeatures({}), { ssh: true, rdp: true });
  assert.deepEqual(remoteFeatures({ REMOTE_SSH_ENABLED: 'false', REMOTE_RDP_ENABLED: 'TRUE' }), { ssh: false, rdp: true });
});
