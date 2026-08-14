const { WebSocketServer } = require('ws');
const { getSessionId, getStoredSession } = require('./websocket_session');
const {
  ChromiumInputError,
  dispatchInput,
  launchChromiumPage,
  normalizeStartUrl,
  screenSize,
} = require('./services/chromium');

const MAX_MESSAGE_BYTES = 32 * 1024;

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function attachChromiumServer(server, options) {
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const sessions = new Set();

  server.on('upgrade', async (req, socket, head) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    if (requestUrl.pathname !== '/api/chromium/ws') return;
    try {
      const sessionId = getSessionId(req.headers.cookie, options.sessionCookieName, options.sessionSecret);
      const sessionData = sessionId && await getStoredSession(options.sessionStore, sessionId);
      if (!sessionData?.user?.id) throw new Error('Unauthorized');
      websocketServer.handleUpgrade(req, socket, head, ws => websocketServer.emit('connection', ws, req));
    } catch (_) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    }
  });

  websocketServer.on('connection', socket => {
    let chromium = null;
    let closed = false;
    let timeout = null;
    sessions.add(socket);

    const closeChromium = async () => {
      clearTimeout(timeout);
      timeout = null;
      const current = chromium;
      chromium = null;
      if (current) await current.close();
    };
    const refreshTimeout = () => {
      clearTimeout(timeout);
      if (chromium) timeout = setTimeout(() => closeChromium(), chromium.timeoutMs);
    };

    socket.on('message', async raw => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'open') {
          const url = normalizeStartUrl(message.url);
          const size = screenSize(message.size);
          await closeChromium();
          if (closed) return;
          send(socket, { type: 'status', status: 'opening' });
          chromium = await launchChromiumPage({
            startUrl: url,
            size,
            env: options.env,
            puppeteerImpl: options.puppeteerImpl,
            onFrame: frame => {
              if (!closed) send(socket, {
                type: 'frame',
                data: frame.data,
                metadata: frame.metadata,
              });
            },
          });
          refreshTimeout();
          send(socket, { type: 'ready', url, size: chromium.size });
          return;
        }
        if (!chromium) throw new ChromiumInputError('Chromium session is not open');
        refreshTimeout();
        if (message.type === 'navigate') {
          const url = normalizeStartUrl(message.url);
          await chromium.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          send(socket, { type: 'navigated', url });
        } else if (message.type === 'input') {
          await dispatchInput(chromium.cdp, message.input, chromium.size);
        } else if (message.type === 'close') {
          await closeChromium();
          send(socket, { type: 'closed' });
        } else {
          throw new ChromiumInputError('Unsupported Chromium message');
        }
      } catch (error) {
        console.error('[Chromium] Session request failed:', error);
        send(socket, {
          type: 'error',
          message: error instanceof ChromiumInputError ? error.message : 'Chromium session failed',
        });
      }
    });
    socket.on('close', () => {
      closed = true;
      sessions.delete(socket);
      closeChromium();
    });
  });

  websocketServer.closeAll = () => {
    for (const socket of sessions) socket.close();
  };
  return websocketServer;
}

module.exports = { attachChromiumServer, MAX_MESSAGE_BYTES };
