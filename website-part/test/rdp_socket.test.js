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
