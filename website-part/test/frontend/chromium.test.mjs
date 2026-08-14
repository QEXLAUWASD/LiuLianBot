import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeChromiumPage, normalizeUrl } from '../../public/js/chromium.mjs';

class FakeWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(value) { this.sent.push(JSON.parse(value)); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}

function setupDocument() {
  const windowRef = new JSDOM(`
    <form id="chromiumAddressForm"><input id="chromiumAddress"><button type="submit">Go</button></form>
    <div id="chromiumStatus"></div><section id="chromiumHome"></section>
    <button id="chromiumHomeButton" hidden>Home</button><section id="chromiumFramePanel" hidden></section>
    <canvas id="chromiumFrame"></canvas><div class="chromium-quick-links"><a href="https://example.com/">Example</a></div>
  `, { url: 'https://www.liulian.dev/chromium.html' }).window;
  windowRef.HTMLCanvasElement.prototype.getContext = () => null;
  return windowRef.document;
}

test('normalizes only http and https URLs', () => {
  assert.equal(normalizeUrl(' https://example.com/path '), 'https://example.com/path');
  assert.throws(() => normalizeUrl('javascript:alert(1)'), /只支援/);
  assert.throws(() => normalizeUrl(''), /請輸入網址/);
});

test('opens a CDP screencast WebSocket and sends the requested URL', async () => {
  FakeWebSocket.instances = [];
  const documentRef = setupDocument();
  const controls = initializeChromiumPage({
    documentRef, WebSocketImpl: FakeWebSocket, locationRef: documentRef.defaultView.location,
  });
  const opened = controls.openUrl('https://example.com/');
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, 'wss://www.liulian.dev/api/chromium/ws');
  socket.open();
  assert.deepEqual(socket.sent[0], {
    type: 'open', url: 'https://example.com/', size: { width: 1280, height: 720 },
  });
  socket.message({ type: 'ready', url: 'https://example.com/', size: { width: 1280, height: 720 } });
  assert.equal(await opened, 'https://example.com/');
  assert.match(documentRef.getElementById('chromiumStatus').textContent, /已連線/);

  const canvas = documentRef.getElementById('chromiumFrame');
  canvas.dispatchEvent(new documentRef.defaultView.MouseEvent('mousedown', {
    bubbles: true, clientX: 40, clientY: 30, button: 0,
  }));
  assert.equal(socket.sent.at(-1).type, 'input');
  assert.equal(socket.sent.at(-1).input.eventType, 'mousePressed');

  controls.destroySession();
  assert.equal(socket.readyState, 3);
  assert.equal(documentRef.getElementById('chromiumFramePanel').hidden, true);
});

test('reports WebSocket errors and rejects unsafe URLs', async () => {
  const documentRef = setupDocument();
  const controls = initializeChromiumPage({
    documentRef, WebSocketImpl: FakeWebSocket, locationRef: documentRef.defaultView.location,
  });
  assert.throws(() => controls.openUrl('javascript:alert(1)'), /只支援/);
  const opened = controls.openUrl('https://example.com/');
  const socket = FakeWebSocket.instances.at(-1);
  socket.onerror?.();
  await assert.rejects(opened, /無法連線/);
  assert.match(documentRef.getElementById('chromiumStatus').textContent, /無法連線/);
});
