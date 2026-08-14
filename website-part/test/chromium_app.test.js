const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  DEFAULT_URL,
  launchChromium,
  normalizeUrl,
  parseChromiumArguments,
} = require('../src/chromium');

test('native Chromium normalizes and validates HTTP URLs', () => {
  assert.equal(normalizeUrl(' https://example.com/path '), 'https://example.com/path');
  assert.equal(normalizeUrl('http://localhost:3000'), 'http://localhost:3000/');
  assert.throws(() => normalizeUrl('javascript:alert(1)'), /只支援/);
  assert.throws(() => normalizeUrl(''), /請輸入網址/);
});

test('native Chromium parses URL, devtools, and environment options', () => {
  assert.deepEqual(parseChromiumArguments(['--devtools', '--url', 'https://example.com/']), {
    help: false,
    url: 'https://example.com/',
    enableDevtools: true,
  });
  assert.equal(parseChromiumArguments([], { CHROMIUM_URL: 'https://example.org/' }).url, 'https://example.org/');
  assert.equal(parseChromiumArguments([], {}).url, DEFAULT_URL);
});

test('native Chromium rejects unknown command-line options', () => {
  assert.throws(() => parseChromiumArguments(['--no-such-option']), /不支援的參數/);
});

test('native Chromium creates a guarded WebView window', async () => {
  class FakeWebview extends EventEmitter {}
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.title = null;
      this.webview = new FakeWebview();
    }

    createWebview(options) {
      this.webview.options = options;
      return this.webview;
    }

    setTitle(title) {
      this.title = title;
    }
  }
  class FakeApplication extends EventEmitter {
    async whenReady() {}

    createBrowserWindow(options) {
      this.window = new FakeWindow(options);
      return this.window;
    }

    exit() {}
  }

  const result = await launchChromium({
    initialUrl: 'https://example.com/',
    enableDevtools: true,
    ApplicationClass: FakeApplication,
  });

  assert.deepEqual(result.window.options, { title: 'LiuLianBot Chromium', width: 1440, height: 900 });
  assert.equal(result.webview.options.url, 'https://example.com/');
  assert.equal(result.webview.options.enableDevtools, true);
  assert.equal(result.webview.options.navigationHandler('https://example.org/'), true);
  assert.equal(result.webview.options.navigationHandler('file:///secret'), false);
  result.webview.emit('title-changed', { title: 'Example' });
  assert.equal(result.window.title, 'Example');
});
