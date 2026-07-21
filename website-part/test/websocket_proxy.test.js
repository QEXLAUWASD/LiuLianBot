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
