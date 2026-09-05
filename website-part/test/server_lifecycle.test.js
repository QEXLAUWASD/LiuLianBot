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

test('stopServer closes RDP transports before waiting for HTTP shutdown', async () => {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, resolve));
  const calls = [];
  server.chromiumServer = { closeAll: () => calls.push('chromium') };
  server.rdpServer = { close: callback => { calls.push('rdp'); callback(); } };
  await stopServer(server);
  assert.deepEqual(calls, ['chromium', 'rdp']);
  assert.equal(server.listening, false);
});
