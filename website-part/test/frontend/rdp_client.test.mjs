import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { JSDOM } from 'jsdom';
import { RdpClient } from '../../public/js/rdp_client.mjs';
import { pointerPosition } from '../../public/js/rdp_input.mjs';
import { decodeBitmap } from '../../public/js/rdp_bitmap.mjs';

class Socket extends EventEmitter {
  connected = false;
  sent = [];
  emit(name, ...args) { this.sent.push([name, ...args]); return true; }
  receive(name, ...args) { return super.emit(name, ...args); }
  connect() { this.connected = true; this.receive('connect'); }
  disconnect() { this.connected = false; this.receive('disconnect'); }
}
function fixture(options = {}) {
  const dom = new JSDOM('<canvas tabindex="0" width="1280" height="720"></canvas><input>');
  const canvas = dom.window.document.querySelector('canvas');
  canvas.getBoundingClientRect = () => ({ left: 50, top: 100, width: 640, height: 360 });
  const sockets = [];
  const states = [];
  const client = new RdpClient(canvas, {
    socketFactory: options => { assert.equal(options.reconnection, false); const socket = new Socket(); sockets.push(socket); return socket; },
    render: () => {}, onState: value => states.push(value), ...options,
  });
  return { dom, canvas, sockets, states, client };
}
test('scaled canvas coordinates respect scrolling position and clamp edges', () => {
  const f = fixture();
  assert.deepEqual(pointerPosition(f.canvas, { clientX: 370, clientY: 280 }), [640, 360]);
  assert.deepEqual(pointerPosition(f.canvas, { clientX: 0, clientY: 1000 }), [0, 719]);
  f.dom.window.close();
});
test('reconnect removes old listeners, credentials send once, keyboard stays scoped', () => {
  const f = fixture();
  f.client.connect({ password: 'test-secret' });
  const first = f.sockets[0];
  assert.equal(first.sent.filter(([name]) => name === 'infos').length, 1);
  first.receive('rdp-connect');
  f.canvas.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { code: 'ControlLeft' }));
  f.dom.window.document.querySelector('input').focus();
  assert.deepEqual(first.sent.slice(-2), [['scancode', 29, true], ['scancode', 29, false]]);
  const before = first.sent.length;
  f.dom.window.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { code: 'KeyA' }));
  assert.equal(first.sent.length, before);
  f.client.connect({ password: 'new-secret' });
  assert.equal(first.eventNames().length, 0);
  assert.equal(first.connected, false);
  first.receive('rdp-close');
  assert.equal(f.client.state, 'connecting');
  const second = f.sockets[1];
  second.receive('rdp-connect');
  f.canvas.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { code: 'KeyA' }));
  assert.deepEqual(second.sent.at(-1), ['scancode', 30, true]);
  assert.equal(first.sent.length, before);
  f.client.destroy();
  f.dom.window.close();
});
test('transport and protocol errors clear listeners and show one terminal state', () => {
  const f = fixture();
  f.client.connect({});
  const socket = f.sockets[0];
  socket.receive('rdp-error', { message: 'Refused' });
  socket.receive('disconnect');
  assert.equal(f.client.state, 'error');
  assert.equal(f.states.at(-1).message, 'Refused');
  assert.equal(socket.connected, false);
  assert.equal(socket.eventNames().length, 0);
  f.dom.window.close();
});
test('client timeout cancels transport and allows a fresh attempt', async () => {
  const f = fixture({ timeoutMs: 5 });
  f.client.connect({});
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.client.state, 'error');
  assert.equal(f.sockets[0].connected, false);
  f.client.connect({});
  assert.equal(f.client.state, 'connecting');
  f.client.destroy();
  f.dom.window.close();
});
test('bitmap failures terminate the session instead of leaving a frozen connected view', () => {
  const f = fixture({ render: () => { throw new Error('bad bitmap'); } });
  f.client.connect({});
  f.sockets[0].receive('rdp-connect');
  f.sockets[0].receive('rdp-bitmap', {});
  assert.equal(f.client.state, 'error');
  assert.equal(f.sockets[0].connected, false);
  f.dom.window.close();
});
const bitmap = overrides => ({
  width: 1, height: 2, destLeft: 0, destTop: 0, destRight: 0, destBottom: 1,
  bitsPerPixel: 24, isCompress: false, ...overrides,
});
test('uncompressed bitmap converts padded bottom-up BGR to opaque top-down RGBA', () => {
  const result = decodeBitmap(bitmap({ data: Uint8Array.from([255,0,0,0, 0,0,255,0]) }));
  assert.deepEqual([...result.data], [255,0,0,255, 0,0,255,255]);
});
test('16-bit pixels decode RGB565 and malformed lengths are rejected', () => {
  const result = decodeBitmap(bitmap({ bitsPerPixel: 16, data: Uint8Array.from([0x1f,0,0,0xf8]) }));
  assert.deepEqual([...result.data], [255,0,0,255, 0,0,255,255]);
  assert.throws(() => decodeBitmap(bitmap({ data: new Uint8Array(1) })), /Truncated/);
  assert.throws(() => decodeBitmap(bitmap({ width: 999999, data: new Uint8Array(1) })), /dimensions/);
});
test('compressed bitmap copies decoded memory before free and frees after decoder failure', () => {
  const freed = [];
  let next = 8;
  const module = {
    HEAPU8: new Uint8Array(100),
    _malloc(size) { const ptr = next; next += size; return ptr; },
    _free(ptr) { freed.push(ptr); this.HEAPU8.fill(0, ptr); },
    ccall(name, result, types, args) {
      assert.equal(types.length, 7);
      this.HEAPU8.set([1,2,3,255,4,5,6,255], args[0]);
    },
  };
  const result = decodeBitmap(bitmap({ isCompress: true, data: new Uint8Array([1]) }), module);
  assert.deepEqual([...result.data], [3,2,1,255,6,5,4,255]);
  assert.equal(freed.length, 2);
  module.ccall = () => { throw new Error('decode'); };
  assert.throws(() => decodeBitmap(bitmap({ isCompress: true, data: new Uint8Array([1]) }), module));
  assert.equal(freed.length, 4);
});

test('bundled RLE decoder renders 16/24-bit literal runs with correct colors and row order', () => {
  const module = createRequire(import.meta.url)('../../public/vendor/webrdp/rle.js');
  for (const [bpp, bytes] of [[16, [0x82,0x1f,0,0,0xf8]], [24, [0x82,255,0,0,0,0,255]]]) {
    const result = decodeBitmap(bitmap({ bitsPerPixel: bpp, isCompress: true, data: Uint8Array.from(bytes) }), module);
    assert.deepEqual([...result.data], [255,0,0,255, 0,0,255,255]);
  }
});

test('ending pointer capture preserves a held Ctrl key until blur', () => {
  const f = fixture();
  f.client.connect({});
  f.sockets[0].receive('rdp-connect');
  f.canvas.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { code: 'ControlLeft' }));
  f.canvas.dispatchEvent(new f.dom.window.Event('lostpointercapture'));
  assert.deepEqual(f.sockets[0].sent.at(-1), ['scancode', 29, true]);
  f.canvas.blur();
  assert.deepEqual(f.sockets[0].sent.at(-1), ['scancode', 29, false]);
  f.client.destroy();
  f.dom.window.close();
});
