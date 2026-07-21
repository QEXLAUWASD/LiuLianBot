const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { requireConnectionAccess } = require('../middleware/connection_auth');
const { getConnectionAccessBySlug } = require('../db');
const { getUpstreamCookies, rewriteSetCookie, rewriteLocation } = require('../proxy_helpers');
const { getSessionId, getStoredSession } = require('../websocket_session');

const router = express.Router({ mergeParams: true });

router.use(requireConnectionAccess);

router.use((req, res, next) => {
  const expectedPath = `/connect/${req.params.slug}`;
  const requestPath = new URL(req.originalUrl, 'http://localhost').pathname;
  if (requestPath === expectedPath) {
    return res.redirect(302, `${expectedPath}/`);
  }
  return next();
});

function setUpstreamRequestHeaders(proxyReq, req, websocket = false) {
  const cookies = getUpstreamCookies(proxyReq.getHeader('cookie'), req.params.slug);
  if (cookies) proxyReq.setHeader('cookie', cookies);
  else proxyReq.removeHeader('cookie');
  proxyReq.setHeader('x-forwarded-prefix', `/connect/${req.params.slug}`);

  if (websocket && proxyReq.getHeader('origin')) {
    proxyReq.setHeader('origin', new URL(req.connectionTarget.target_url).origin);
  }
}

const proxy = createProxyMiddleware({
  router: req => req.connectionTarget.target_url,
  changeOrigin: true,
  xfwd: true,
  secure: process.env.PROXY_ALLOW_SELF_SIGNED !== 'true',
  proxyTimeout: 30000,
  timeout: 30000,
  on: {
    proxyReq(proxyReq, req) {
      setUpstreamRequestHeaders(proxyReq, req);
    },
    proxyReqWs(proxyReq, req) {
      setUpstreamRequestHeaders(proxyReq, req, true);
    },
    proxyRes(proxyRes, req) {
      const setCookies = proxyRes.headers['set-cookie'];
      if (setCookies) {
        proxyRes.headers['set-cookie'] = setCookies.map(cookie =>
          rewriteSetCookie(cookie, req.params.slug, req.connectionTarget.target_url)
        );
      }

      if (proxyRes.headers.location) {
        proxyRes.headers.location = rewriteLocation(
          proxyRes.headers.location,
          req.connectionTarget.target_url,
          req.params.slug
        );
      }
    },
    error(err, req, responseOrSocket) {
      console.error(`[ConnectionProxy] ${req.params?.slug || 'unknown'}:`, err.message);
      if (typeof responseOrSocket.writeHead === 'function') {
        if (!responseOrSocket.headersSent) {
          responseOrSocket.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        responseOrSocket.end('The target website is unavailable');
      } else if (!responseOrSocket.destroyed) {
        responseOrSocket.destroy();
      }
    },
  },
});

router.use(proxy);

function websocketRequest(req) {
  const parsed = new URL(req.url, 'http://localhost');
  const match = parsed.pathname.match(/^\/connect\/([a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?)(?=\/|$)/i);
  if (!match) return null;
  const upstreamPath = parsed.pathname.slice(match[0].length) || '/';
  return {
    slug: match[1].toLowerCase(),
    upstreamUrl: `${upstreamPath}${parsed.search}`,
  };
}

function rejectUpgrade(socket, statusCode, statusText) {
  if (socket.destroyed) return;
  const body = `${statusCode} ${statusText}`;
  socket.end(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
    'Connection: close\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
  );
}

function attachWebSocketServer(server, options) {
  const { sessionStore, sessionCookieName, sessionSecret } = options;

  server.on('upgrade', async (req, socket, head) => {
    const request = websocketRequest(req);
    if (!request) {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }

    try {
      const sessionId = getSessionId(req.headers.cookie, sessionCookieName, sessionSecret);
      if (!sessionId) {
        rejectUpgrade(socket, 401, 'Unauthorized');
        return;
      }

      const sessionData = await getStoredSession(sessionStore, sessionId);
      const userId = sessionData?.user?.id;
      if (!userId) {
        rejectUpgrade(socket, 401, 'Unauthorized');
        return;
      }

      const access = await getConnectionAccessBySlug(request.slug, userId);
      if (!access) {
        rejectUpgrade(socket, 404, 'Not Found');
        return;
      }
      if (!access.allowed) {
        rejectUpgrade(socket, 403, 'Forbidden');
        return;
      }

      req.params = { slug: request.slug };
      req.connectionTarget = access.connection;
      req.connectionUser = access.user;
      req.url = request.upstreamUrl;
      proxy.upgrade(req, socket, head);
    } catch (err) {
      console.error('[ConnectionProxy] WebSocket authorization error:', err);
      rejectUpgrade(socket, 500, 'Internal Server Error');
    }
  });
}

router.attachWebSocketServer = attachWebSocketServer;
router.websocketRequest = websocketRequest;

module.exports = router;
