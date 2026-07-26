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

test('redirects root-relative HTTP requests back through the referring connection', () => {
  const req = {
    originalUrl: '/api/graphql?operation=GetAbout',
    url: '/api/graphql?operation=GetAbout',
    protocol: 'http',
    get(name) {
      return {
        host: 'dash.example.test',
        referer: 'http://dash.example.test/connect/suwayomi/',
      }[name.toLowerCase()];
    },
  };
  const res = {
    statusCode: null,
    location: null,
    redirect(statusCode, location) {
      this.statusCode = statusCode;
      this.location = location;
    },
  };

  connectionProxy.redirectRootRelativeRequest(req, res, () => assert.fail('must redirect'));

  assert.equal(res.statusCode, 307);
  assert.equal(res.location, '/connect/suwayomi/__upstream_root__/api/graphql?operation=GetAbout');
});

test('leaves root-relative requests alone without a proxied same-origin referrer', () => {
  const req = {
    originalUrl: '/api/auth/me',
    url: '/api/auth/me',
    protocol: 'http',
    get(name) {
      return {
        host: 'dash.example.test',
        referer: 'http://dash.example.test/index.html',
      }[name.toLowerCase()];
    },
  };
  let continued = false;

  connectionProxy.redirectRootRelativeRequest(req, {}, () => { continued = true; });

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
