const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ChromiumInputError,
  chromiumConfig,
  dispatchInput,
  launchChromiumPage,
  normalizeStartUrl,
  screenSize,
} = require('../src/services/chromium');

test('validates Chromium URLs, screen sizes, and configuration', () => {
  assert.equal(normalizeStartUrl(' https://example.com/ '), 'https://example.com/');
  assert.throws(() => normalizeStartUrl('javascript:alert(1)'), ChromiumInputError);
  assert.deepEqual(screenSize({ width: 1024, height: 768 }), { width: 1024, height: 768 });
  assert.throws(() => screenSize({ width: 320, height: 200 }), /screen size/);
  assert.deepEqual(chromiumConfig({ CHROME_EXECUTABLE_PATH: 'C:\\chrome.exe', CHROMIUM_SESSION_TIMEOUT_MS: '90000' }), {
    executablePath: 'C:\\chrome.exe', sessionTimeoutMs: 90000,
  });
});

test('launches Chrome, starts CDP screencast, and closes cleanly', async () => {
  const calls = [];
  const cdp = {
    on: (event, handler) => { cdp.handler = handler; calls.push(['on', event]); },
    send: async (...args) => calls.push(args),
  };
  const page = {
    setViewport: async value => calls.push(['viewport', value]),
    target: () => ({ createCDPSession: async () => cdp }),
    goto: async (...args) => calls.push(['goto', ...args]),
  };
  const browser = {
    newPage: async () => page,
    close: async () => calls.push(['close']),
  };
  const puppeteerImpl = { launch: async options => { calls.push(['launch', options]); return browser; } };
  const session = await launchChromiumPage({
    startUrl: 'https://example.com/',
    size: { width: 1024, height: 768 },
    puppeteerImpl,
    env: { CHROME_EXECUTABLE_PATH: 'C:\\chrome.exe', CHROMIUM_SESSION_TIMEOUT_MS: '90000' },
  });
  assert.equal(calls[0][0], 'launch');
  assert.equal(calls[0][1].executablePath, 'C:\\chrome.exe');
  assert.deepEqual(calls.find(call => call[0] === 'viewport'), ['viewport', { width: 1024, height: 768 }]);
  assert.ok(calls.some(call => call[0] === 'Page.startScreencast'));
  assert.ok(calls.some(call => call[0] === 'goto'));
  await session.close();
  assert.deepEqual(calls.at(-2), ['Page.stopScreencast']);
  assert.deepEqual(calls.at(-1), ['close']);
});

test('dispatches bounded CDP mouse, wheel, and keyboard input', async () => {
  const calls = [];
  const cdp = { send: async (...args) => calls.push(args) };
  await dispatchInput(cdp, { type: 'mouse', eventType: 'mousePressed', x: 50, y: 60, button: 'left' }, { width: 100, height: 100 });
  await dispatchInput(cdp, { type: 'wheel', x: 50, y: 60, deltaY: 3000 }, { width: 100, height: 100 });
  await dispatchInput(cdp, { type: 'key', eventType: 'keyDown', key: 'a', code: 'KeyA' }, { width: 100, height: 100 });
  assert.equal(calls[0][0], 'Input.dispatchMouseEvent');
  assert.equal(calls[1][1].deltaY, 1200);
  assert.deepEqual(calls[2], ['Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA' }]);
  await assert.rejects(dispatchInput(cdp, { type: 'unknown' }, { width: 100, height: 100 }), /Unsupported/);
});
