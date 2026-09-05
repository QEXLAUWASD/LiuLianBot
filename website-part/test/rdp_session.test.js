const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { bindRdpSession } = require('../src/services/rdp_session');

class Socket extends EventEmitter {
  connected = true;
  sent = [];
  emit(name, ...args) { this.sent.push([name, ...args]); return true; }
  receive(name, ...args) { return super.emit(name, ...args); }
  disconnect() { this.connected = false; this.receive('disconnect'); }
}
function fixture(overrides = {}) {
  const socket = new Socket();
  const client = new EventEmitter();
  const calls = [];
  client.close = () => { calls.push(['close']); client.emit('close'); };
  client.bufferLayer = { socket: { destroy: () => calls.push(['destroy']) } };
  for (const method of ['connect', 'sendPointerEvent', 'sendWheelEvent', 'sendKeyEventScancode', 'sendKeyEventUnicode']) {
    client[method] = (...args) => calls.push([method, ...args]);
  }
  let created = 0;
  const session = bindRdpSession(socket, {
    createClient: () => { created++; return client; },
    authorize: async () => {},
    resolveConnection: async () => ({ address: '203.0.113.1', port: 3389 }),
    screenSize: () => ({ width: 1280, height: 720 }),
    errorPayload: error => ({ message: error.message }),
    ...overrides,
  });
  return { socket, client, calls, session, created: () => created };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('cancelling during asynchronous validation never creates an RDP client', async () => {
  let resolve;
  const f = fixture({ resolveConnection: () => new Promise(done => { resolve = done; }) });
  f.socket.receive('infos', {});
  await tick();
  f.socket.disconnect();
  resolve({ address: '203.0.113.1', port: 3389 });
  await tick();
  assert.equal(f.created(), 0);
});
test('duplicate connect requests are ignored; input is gated and extended keys translated', async () => {
  const f = fixture();
  f.socket.receive('infos', {});
  f.socket.receive('infos', {});
  f.socket.receive('scancode', 30, true);
  await tick();
  assert.equal(f.created(), 1);
  assert.deepEqual(f.calls, [['connect', '203.0.113.1', 3389]]);
  f.client.emit('connect');
  f.socket.receive('mouse', -1, 20, 1, true);
  f.socket.receive('mouse', 1280, 20, 1, true);
  f.socket.receive('mouse', 1, 20, 3, true);
  f.socket.receive('scancode', 0xe04b, true);
  f.socket.receive('scancode', {}, true);
  f.socket.receive('wheel', 1, 20, Infinity, false, false);
  assert.deepEqual(f.calls.slice(1), [['sendPointerEvent', 1, 20, 3, true], ['sendKeyEventScancode', 75, true, true]]);
  f.session.close();
  assert.deepEqual(f.calls.slice(-2), [['close'], ['destroy']]);
});
test('errors terminate once and ignore late protocol events', async () => {
  const f = fixture();
  f.socket.receive('infos', {});
  await tick();
  f.client.emit('error', new Error('Connection failed'));
  f.client.emit('connect');
  f.client.emit('bitmap', {});
  f.client.emit('error', new Error('Late failure'));
  assert.deepEqual(f.socket.sent, [['rdp-error', { message: 'Connection failed' }]]);
  assert.equal(f.socket.connected, false);
});
test('connection timeout destroys even a not-yet-connected TCP socket', async () => {
  const f = fixture({ timeoutMs: 10 });
  f.socket.receive('infos', {});
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.socket.connected, false);
  assert.deepEqual(f.calls.slice(-2), [['close'], ['destroy']]);
  assert.equal(f.socket.sent[0][1].message, 'RDP connection timed out');
});
test('authorization failure never resolves or connects a destination', async () => {
  let resolved = false;
  const f = fixture({
    authorize: async () => { throw new Error('Login required'); },
    resolveConnection: async () => { resolved = true; },
  });
  f.socket.receive('infos', {});
  await tick();
  assert.equal(resolved, false);
  assert.equal(f.created(), 0);
  assert.equal(f.socket.connected, false);
});
