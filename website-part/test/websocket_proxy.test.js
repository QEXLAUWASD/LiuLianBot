const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const net = require('net');
const connectionProxy = require('../src/routes/connection_proxy');

test('extracts the connection slug and upstream WebSocket path', () => {
  assert.deepEqual(
    connectionProxy.websocketRequest({ url: '/connect/reports/socket.io/?EIO=4&transport=websocket' }),
    {
      slug: 'reports',
      upstreamUrl: '/socket.io/?EIO=4&transport=websocket',
    }
  );
  assert.equal(connectionProxy.websocketRequest({ url: '/socket.io/' }), null);
  assert.equal(connectionProxy.isSocketIoRequest({ url: '/socket.io/?EIO=4&transport=websocket' }), true);
  assert.equal(connectionProxy.isSocketIoRequest({ url: '/connect/reports/socket.io/' }), false);
});

test('maps upstream-root markers without mutating the configured connection', () => {
  const configured = {
    id: 1,
    target_url: 'https://internal.example/app/',
  };
  const req = {
    url: '/__upstream_root__/socket.io/?EIO=4',
    connectionTarget: configured,
  };

  connectionProxy.applyUpstreamRootPath(req);

  assert.equal(req.url, '/socket.io/?EIO=4');
  assert.equal(req.connectionTarget.target_url, 'https://internal.example');
  assert.notEqual(req.connectionTarget, configured);
  assert.equal(configured.target_url, 'https://internal.example/app/');
});

test('keeps configured target base for marked upstream internal connect paths', () => {
  const configured = {
    id: 1,
    target_url: 'https://internal.example/mcsm/',
  };
  const req = {
    url: '/__upstream_root__/connect/4090-mcsm-daemon/socket.io/?EIO=4',
    connectionTarget: configured,
  };

  connectionProxy.applyUpstreamRootPath(req);

  assert.equal(req.url, '/connect/4090-mcsm-daemon/socket.io/?EIO=4');
  assert.equal(req.connectionTarget, configured);
  assert.equal(req.connectionTarget.target_url, 'https://internal.example/mcsm/');
});

test('uses new routing only for connections that do not opt into legacy routing', async () => {
  const createRequest = legacyProxyRouting => ({
    session: { user: { id: 'user-1' } },
    originalUrl: '/api/graphql?operation=GetAbout',
    url: '/api/graphql?operation=GetAbout',
    protocol: 'https',
    get(name) {
      return {
        host: 'dash.example.test',
        referer: 'https://dash.example.test/connect/suwayomi/',
      }[name.toLowerCase()];
    },
  });
  const redirects = [];
  const middleware = connectionProxy.createRedirectRootRelativeRequest(async () => ({
    allowed: true,
    connection: { legacy_proxy_routing: false },
  }));
  await middleware(createRequest(false), {
    redirect(status, location) { redirects.push([status, location]); },
  }, () => assert.fail('must redirect'));
  assert.deepEqual(redirects, [[307, '/connect/suwayomi/__upstream_root__/api/graphql?operation=GetAbout']]);

  let continued = false;
  const legacyMiddleware = connectionProxy.createRedirectRootRelativeRequest(async () => ({
    allowed: true,
    connection: { legacy_proxy_routing: true },
  }));
  await legacyMiddleware(createRequest(true), {}, () => { continued = true; });
  assert.equal(continued, true);
});

test('removes upstream browser policy headers that do not match the proxy origin', () => {
  const proxyRes = {
    headers: {
      'content-security-policy': "default-src 'self'",
      'content-security-policy-report-only': "script-src 'unsafe-inline' 'unsafe-eval'",
      'service-worker-allowed': '/',
      'content-type': 'text/html',
    },
  };

  connectionProxy.sanitizeUpstreamResponseHeaders(proxyRes);

  assert.equal(proxyRes.headers['content-security-policy'], undefined);
  assert.equal(proxyRes.headers['content-security-policy-report-only'], undefined);
  assert.equal(proxyRes.headers['service-worker-allowed'], undefined);
  assert.equal(proxyRes.headers['content-type'], 'text/html');
});

test('rewrites browser origin headers for upstream CSRF checks', () => {
  const headers = new Map([
    ['cookie', 'llb_qbit_SID=upstream-session; connect.sid=main-session'],
    ['origin', 'https://www.liulian.dev'],
    ['referer', 'https://www.liulian.dev/connect/qbit/'],
  ]);
  const proxyReq = {
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    removeHeader(name) {
      headers.delete(name.toLowerCase());
    },
  };
  const req = {
    params: { slug: 'qbit' },
    protocol: 'https',
    url: '/api/v2/auth/login',
    connectionTarget: { target_url: 'http://127.0.0.1:8080/' },
    get(name) {
      return { host: 'www.liulian.dev' }[name.toLowerCase()];
    },
  };

  connectionProxy.setUpstreamRequestHeaders(proxyReq, req);

  assert.equal(headers.get('cookie'), 'SID=upstream-session');
  assert.equal(headers.get('origin'), 'http://127.0.0.1:8080');
  assert.equal(headers.get('referer'), 'http://127.0.0.1:8080/api/v2/auth/login');
  assert.equal(headers.get('x-forwarded-host'), 'www.liulian.dev');
  assert.equal(headers.get('x-forwarded-proto'), 'https');
  assert.equal(headers.get('x-forwarded-prefix'), '/connect/qbit');
});

test('supports native WebSocket upgrade requests without Express helpers', () => {
  const headers = new Map([
    ['cookie', 'connect.sid=main-session'],
    ['origin', 'https://www.liulian.dev'],
    ['referer', 'https://www.liulian.dev/connect/suwayomi/api/v1/webview'],
  ]);
  const proxyReq = {
    getHeader(name) { return headers.get(name.toLowerCase()); },
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    removeHeader(name) { headers.delete(name.toLowerCase()); },
  };
  const req = {
    params: { slug: 'suwayomi' },
    url: '/api/v1/webview',
    headers: {
      host: 'www.liulian.dev',
      'x-forwarded-proto': 'https',
    },
    socket: { encrypted: false },
    connectionTarget: { target_url: 'http://192.168.0.1:4567/connect/suwayomi/' },
  };

  connectionProxy.setUpstreamRequestHeaders(proxyReq, req, true);

  assert.equal(headers.get('origin'), 'http://192.168.0.1:4567');
  assert.equal(headers.get('referer'), 'https://www.liulian.dev/connect/suwayomi/api/v1/webview');
  assert.equal(headers.get('x-forwarded-host'), 'www.liulian.dev');
  assert.equal(headers.get('x-forwarded-proto'), 'https');
});

test('rejects a WebSocket upgrade without a signed session cookie', async () => {
  const server = http.createServer();
  connectionProxy.attachWebSocketServer(server, {
    sessionStore: { get() { throw new Error('Session store must not be called'); } },
    sessionCookieName: 'connect.sid',
    sessionSecret: 'test-secret',
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const response = await new Promise((resolve, reject) => {
      const socket = net.createConnection(server.address().port, '127.0.0.1');
      let data = '';
      socket.setEncoding('utf8');
      socket.on('connect', () => {
        socket.write(
          'GET /connect/reports/ws HTTP/1.1\r\n' +
          'Host: localhost\r\n' +
          'Connection: Upgrade\r\n' +
          'Upgrade: websocket\r\n\r\n'
        );
      });
      socket.on('data', chunk => { data += chunk; });
      socket.on('end', () => resolve(data));
      socket.on('error', reject);
    });

    assert.match(response, /^HTTP\/1\.1 401 Unauthorized/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
