import assert from 'node:assert/strict';
import test from 'node:test';

import { ChromiumSession, normalizeUrl, websocketUrl } from '../../frontend/src/lib/chromiumSession.mjs';
import { ChromiumPage } from '../../frontend/src/pages/ChromiumPage.jsx';
import { click, flush, render, setupDom, typeInto } from '../support/react.mjs';

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  send(value) {
    this.sent.push(JSON.parse(value));
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  message(value) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

class FakeImage {
  static instances = [];

  constructor() {
    FakeImage.instances.push(this);
    this.width = 800;
    this.height = 600;
  }

  set src(value) {
    this._src = value;
    this.onload?.();
  }

  get src() {
    return this._src;
  }
}

function canvasFixture() {
  const drawn = [];
  const context = {
    clearRect: (...args) => drawn.push(['clear', ...args]),
    drawImage: (...args) => drawn.push(['draw', ...args]),
  };
  const canvas = { width: 1280, height: 720, getContext: () => context };
  return { canvas, drawn };
}

function sessionFactory(overrides = {}) {
  FakeWebSocket.instances = [];
  FakeImage.instances = [];
  const { canvas, drawn } = canvasFixture();
  const states = [];
  const session = new ChromiumSession(canvas, {
    WebSocketImpl: FakeWebSocket,
    ImageImpl: FakeImage,
    locationRef: { protocol: 'https:', host: 'www.liulian.dev' },
    onState: state => states.push(state),
    ...overrides,
  });
  return { session, canvas, drawn, states };
}

test('normalizes only http and https URLs', () => {
  assert.equal(normalizeUrl(' https://example.com/path '), 'https://example.com/path');
  assert.throws(() => normalizeUrl('javascript:alert(1)'), /只支援/);
  assert.throws(() => normalizeUrl(''), /請輸入網址/);
  assert.equal(websocketUrl({ protocol: 'http:', host: 'example.test' }), 'ws://example.test/api/chromium/ws');
  assert.equal(websocketUrl({ protocol: 'https:', host: 'example.test' }), 'wss://example.test/api/chromium/ws');
});

test('opens a CDP screencast socket, draws frames and resolves on ready', async () => {
  const { session, canvas, drawn, states } = sessionFactory();

  const opened = session.open('https://example.com/', { size: { width: 1280, height: 720 } });
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, 'wss://www.liulian.dev/api/chromium/ws');
  socket.open();
  assert.deepEqual(socket.sent[0], {
    type: 'open',
    url: 'https://example.com/',
    size: { width: 1280, height: 720 },
  });

  socket.message({ type: 'status', status: 'opening' });
  socket.message({ type: 'frame', data: 'ZmFrZQ==', metadata: { deviceWidth: 1024, deviceHeight: 768 } });
  assert.equal(canvas.width, 1024);
  assert.equal(canvas.height, 768);
  assert.equal(drawn.some(entry => entry[0] === 'draw'), true);

  socket.message({ type: 'ready', url: 'https://example.com/' });
  assert.equal(await opened, 'https://example.com/');
  assert.deepEqual(states.at(-1), { state: 'ready', message: 'Chromium 已連線。' });
});

test('socket errors reject the open call and report an error state', async () => {
  const { session, states } = sessionFactory();

  const opened = session.open('https://example.com/');
  const socket = FakeWebSocket.instances[0];
  socket.onerror?.();

  await assert.rejects(opened, /無法連線/);
  assert.deepEqual(states.at(-1), { state: 'error', message: '無法連線到伺服器 Chromium。' });
});

test('destroy closes the socket, clears the canvas and ignores late frames', async () => {
  const { session, canvas, drawn } = sessionFactory();

  const opened = session.open('https://example.com/');
  opened.catch(() => {});
  const socket = FakeWebSocket.instances[0];
  socket.open();
  session.destroy();

  assert.equal(socket.readyState, 3);
  assert.equal(drawn.at(-1)[0], 'clear');
  const drawsBefore = drawn.length;
  socket.message({ type: 'frame', data: 'ZmFrZQ==', metadata: { deviceWidth: 10, deviceHeight: 10 } });
  assert.equal(drawn.length, drawsBefore, 'late frames from a destroyed session are ignored');
  assert.equal(canvas.width, 1280, 'a late ready message never resizes the canvas');
});

test('without WebSocket support the session reports an immediate error', async () => {
  const { session } = sessionFactory({ WebSocketImpl: null });
  await assert.rejects(session.open('https://example.com/'), /WebSocket/);
});

test('the Chromium page renders the address bar, canvas and quick links', async () => {
  const dom = setupDom('<div id="root"></div>', { url: 'https://www.liulian.dev/chromium.html' });
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  FakeWebSocket.instances = [];

  try {
    render(<ChromiumPage />);
    const canvas = dom.document.getElementById('chromiumFrame');
    canvas.getContext = () => ({ clearRect() {}, drawImage() {} });
    assert.equal(canvas.tabIndex, 0);
    assert.equal(dom.document.getElementById('chromiumAddress').type, 'url');
    assert.deepEqual(
      [...dom.document.querySelectorAll('.chromium-quick-links a')].map(link => link.getAttribute('data-chromium-url')),
      ['https://www.google.com/', 'https://github.com/', 'https://developer.mozilla.org/'],
    );

    const address = dom.document.getElementById('chromiumAddress');
    typeInto(address, 'javascript:alert(1)');
    click(dom.document.querySelector('#chromiumAddressForm button[type="submit"]'));
    await flush();
    assert.match(dom.document.getElementById('chromiumStatus').textContent, /只支援/);

    typeInto(address, 'https://example.com/');
    click(dom.document.querySelector('#chromiumAddressForm button[type="submit"]'));
    await flush();
    assert.equal(FakeWebSocket.instances.length, 1);
    assert.equal(dom.document.getElementById('chromiumFramePanel').hidden, false);
  } finally {
    globalThis.WebSocket = originalWebSocket;
    dom.cleanup();
  }
});
