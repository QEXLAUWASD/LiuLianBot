const test = require('node:test');
const assert = require('node:assert/strict');

const { buildListenOptions } = require('../src/config/server');

test('server listen options use the configured bind IP', () => {
  assert.deepEqual(buildListenOptions({ PORT: '8080', BIND_IP: '127.0.0.1' }), {
    port: '8080',
    host: '127.0.0.1',
  });
});

test('server listen options leave the host unspecified when BIND_IP is empty', () => {
  assert.deepEqual(buildListenOptions({ PORT: '3000', BIND_IP: '  ' }), {
    port: '3000',
  });
});
