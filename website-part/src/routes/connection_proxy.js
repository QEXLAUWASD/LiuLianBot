const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const { requireConnectionAccess } = require('../middleware/connection_auth');
const { getConnectionAccessBySlug } = require('../db');
const {
  getUpstreamCookies,
  rewriteSetCookie,
  rewriteLocation,
  rewriteHtmlRootUrls,
} = require('../proxy_helpers');
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

function requestHeader(req, name) {
  if (typeof req.get === 'function') return req.get(name);
  const value = req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function forwardedValue(value) {
  return typeof value === 'string' ? value.split(',', 1)[0].trim() : value;
}

function setUpstreamRequestHeaders(proxyReq, req, websocket = false) {
  const cookies = getUpstreamCookies(proxyReq.getHeader('cookie'), req.params.slug);
  if (cookies) proxyReq.setHeader('cookie', cookies);
  else proxyReq.removeHeader('cookie');
  proxyReq.setHeader('x-forwarded-prefix', `/connect/${req.params.slug}`);
  const host = forwardedValue(requestHeader(req, 'x-forwarded-host')) || requestHeader(req, 'host');
  const protocol = req.protocol
    || forwardedValue(requestHeader(req, 'x-forwarded-proto'))
    || (req.socket?.encrypted ? 'https' : 'http');
  if (host) proxyReq.setHeader('x-forwarded-host', host);
  if (protocol) proxyReq.setHeader('x-forwarded-proto', protocol);

  const target = new URL(req.connectionTarget.target_url);
  const upstreamRequestUrl = new URL(req.url || '/', target);

  if (proxyReq.getHeader('origin')) {
    proxyReq.setHeader('origin', target.origin);
  }
  if (!websocket && proxyReq.getHeader('referer')) {
    proxyReq.setHeader('referer', upstreamRequestUrl.href);
  }
}

function applyUpstreamRootPath(req) {
  const marker = '/__upstream_root__';
  if (req.url !== marker && !req.url.startsWith(`${marker}/`)) return;
  const upstreamPath = req.url.slice(marker.length) || '/';

  // MCSM exposes daemon Socket.IO endpoints under /connect/<daemon>. Those
  // paths belong to the configured target base, even when an older client has
  // already routed them through the upstream-root marker.
  if (upstreamPath.startsWith('/connect/')) {
    req.url = upstreamPath;
    return;
  }

  const target = new URL(req.connectionTarget.target_url);
  req.connectionTarget = {
    ...req.connectionTarget,
    target_url: target.origin,
  };
  req.url = upstreamPath;
}

function referrerConnectionSlug(req) {
  const header = req.get('referer') || req.get('referrer');
  if (!header) return null;

  try {
    const host = req.get('host');
    const referrer = new URL(header, `${req.protocol}://${host || 'localhost'}`);
    if (host && referrer.host !== host) return null;
    const match = referrer.pathname.match(
      /^\/connect\/([a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?)(?=\/|$)/i
    );
    return match ? match[1].toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

function createRedirectRootRelativeRequest(getAccessBySlug = getConnectionAccessBySlug) {
  return async function redirectRootRelativeRequest(req, res, next) {
    const slug = referrerConnectionSlug(req);
    const userId = req.session?.user?.id;
    if (!slug || !userId) return next();

    const requestUrl = req.originalUrl || req.url || '/';
    const requestPath = new URL(requestUrl, 'http://localhost').pathname;
    if (requestPath === `/connect/${slug}` || requestPath.startsWith(`/connect/${slug}/`)) {
      return next();
    }

    try {
      const access = await getAccessBySlug(slug, userId);
      if (!access?.allowed || access.connection.legacy_proxy_routing) return next();

      if (requestPath.startsWith('/connect/')) {
        return res.redirect(307, `/connect/${slug}${requestUrl}`);
      }
      return res.redirect(307, `/connect/${slug}/__upstream_root__${requestUrl}`);
    } catch (err) {
      return next(err);
    }
  };
}

const redirectRootRelativeRequest = createRedirectRootRelativeRequest();

function sanitizeUpstreamResponseHeaders(proxyRes) {
  delete proxyRes.headers['content-security-policy'];
  delete proxyRes.headers['content-security-policy-report-only'];
  delete proxyRes.headers['service-worker-allowed'];
}

const proxy = createProxyMiddleware({
  router: req => req.connectionTarget.target_url,
  changeOrigin: true,
  xfwd: true,
  selfHandleResponse: true,
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
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req) => {
      sanitizeUpstreamResponseHeaders(proxyRes);

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

      const contentType = proxyRes.headers['content-type'] || '';
      if (/text\/html/i.test(contentType)) {
        proxyRes.headers['cache-control'] = 'no-store';
        return rewriteHtmlRootUrls(responseBuffer.toString('utf8'), req.params.slug, req.url);
      }
      return responseBuffer;
    }),
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

router.use((req, res, next) => {
  applyUpstreamRootPath(req);
  next();
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

function isSocketIoRequest(req) {
  const parsed = new URL(req.url, 'http://localhost');
  return parsed.pathname === '/socket.io/' || parsed.pathname === '/socket.io';
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
    if (isSocketIoRequest(req)) return;
    const request = websocketRequest(req);
    // Other WebSocket handlers (SSH, Chromium CDP, and Socket.IO) share this
    // HTTP server. Leave unrelated upgrade paths untouched so their listeners
    // can authenticate and handle them.
    if (!request) return;

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
      applyUpstreamRootPath(req);
      proxy.upgrade(req, socket, head);
    } catch (err) {
      console.error('[ConnectionProxy] WebSocket authorization error:', err);
      rejectUpgrade(socket, 500, 'Internal Server Error');
    }
  });
}

router.attachWebSocketServer = attachWebSocketServer;
router.websocketRequest = websocketRequest;
router.isSocketIoRequest = isSocketIoRequest;
router.applyUpstreamRootPath = applyUpstreamRootPath;
router.createRedirectRootRelativeRequest = createRedirectRootRelativeRequest;
router.redirectRootRelativeRequest = redirectRootRelativeRequest;
router.sanitizeUpstreamResponseHeaders = sanitizeUpstreamResponseHeaders;
router.setUpstreamRequestHeaders = setUpstreamRequestHeaders;

module.exports = router;
