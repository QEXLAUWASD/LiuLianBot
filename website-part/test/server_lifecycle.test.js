const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { stopServer } = require('../src/server');

test('stopServer closes a listening HTTP server', async () => {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, resolve));

  await stopServer(server);

  assert.equal(server.listening, false);
});
