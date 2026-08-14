const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

class ChromiumInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChromiumInputError';
  }
}

function normalizeStartUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new ChromiumInputError('A start URL is required');
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw new ChromiumInputError('Start URL must use http:// or https://');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ChromiumInputError('Start URL must use http:// or https://');
  }
  return url.toString();
}

function screenSize(value = {}) {
  const width = Number(value.width) || DEFAULT_WIDTH;
  const height = Number(value.height) || DEFAULT_HEIGHT;
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < 640 || width > MAX_WIDTH || height < 480 || height > MAX_HEIGHT) {
    throw new ChromiumInputError('Invalid Chromium screen size');
  }
  return { width, height };
}

function chromiumConfig(env = process.env) {
  const candidates = process.platform === 'win32'
    ? [
      `${env.PROGRAMFILES || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
      `${env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    ]
    : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const detectedPath = candidates.find(candidate => candidate && fs.existsSync(candidate));
  return {
    executablePath: String(env.CHROME_EXECUTABLE_PATH || '').trim() || detectedPath,
    sessionTimeoutMs: Math.max(60000, Number(env.CHROMIUM_SESSION_TIMEOUT_MS) || 1800000),
  };
}

function launchOptions(config) {
  return {
    ...(config.executablePath ? { executablePath: config.executablePath } : {}),
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  };
}

async function launchChromiumPage({
  startUrl,
  size,
  onFrame,
  puppeteerImpl,
  env = process.env,
} = {}) {
  const url = normalizeStartUrl(startUrl);
  const viewport = screenSize(size);
  const puppeteer = puppeteerImpl || require('puppeteer-core');
  const config = chromiumConfig(env);
  const browser = await puppeteer.launch(launchOptions(config));
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const cdp = await page.target().createCDPSession();
    await cdp.send('Page.enable');
    cdp.on('Page.screencastFrame', event => {
      Promise.resolve(onFrame?.(event)).finally(() => (
        cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {})
      ));
    });
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 75,
      maxWidth: viewport.width,
      maxHeight: viewport.height,
      everyNthFrame: 1,
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      try { await cdp.send('Page.stopScreencast'); } catch (_) { /* browser may already be gone */ }
      await browser.close().catch(() => {});
    };
    return { browser, page, cdp, close, size: viewport, timeoutMs: config.sessionTimeoutMs };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

function assertFiniteCoordinate(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new ChromiumInputError(`Invalid ${name}`);
  return number;
}

async function dispatchInput(cdp, message, size) {
  if (!message || typeof message.type !== 'string') throw new ChromiumInputError('Invalid Chromium input');
  if (message.type === 'mouse') {
    const eventType = ['mousePressed', 'mouseReleased', 'mouseMoved'].includes(message.eventType)
      ? message.eventType : null;
    if (!eventType) throw new ChromiumInputError('Invalid mouse event');
    const params = {
      type: eventType,
      x: Math.min(assertFiniteCoordinate(message.x, 'mouse x'), size.width),
      y: Math.min(assertFiniteCoordinate(message.y, 'mouse y'), size.height),
      button: ['none', 'left', 'middle', 'right', 'back', 'forward'].includes(message.button)
        ? message.button : 'none',
      clickCount: Math.max(1, Math.min(Number(message.clickCount) || 1, 3)),
    };
    await cdp.send('Input.dispatchMouseEvent', params);
    return;
  }
  if (message.type === 'wheel') {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: Math.min(assertFiniteCoordinate(message.x, 'wheel x'), size.width),
      y: Math.min(assertFiniteCoordinate(message.y, 'wheel y'), size.height),
      deltaX: Math.max(-1200, Math.min(Number(message.deltaX) || 0, 1200)),
      deltaY: Math.max(-1200, Math.min(Number(message.deltaY) || 0, 1200)),
    });
    return;
  }
  if (message.type === 'key') {
    const eventType = ['keyDown', 'keyUp', 'char'].includes(message.eventType)
      ? message.eventType : null;
    if (!eventType) throw new ChromiumInputError('Invalid keyboard event');
    const params = { type: eventType };
    for (const field of ['key', 'code', 'text', 'unmodifiedText']) {
      if (typeof message[field] === 'string') params[field] = message[field].slice(0, 64);
    }
    if (Number.isInteger(message.windowsVirtualKeyCode)) params.windowsVirtualKeyCode = message.windowsVirtualKeyCode;
    await cdp.send('Input.dispatchKeyEvent', params);
    return;
  }
  throw new ChromiumInputError('Unsupported Chromium input');
}

module.exports = {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  ChromiumInputError,
  chromiumConfig,
  dispatchInput,
  launchChromiumPage,
  normalizeStartUrl,
  screenSize,
};
const fs = require('fs');
