// One RDP attempt per transport. Reconnect uses a fresh Socket.IO connection.
function bindRdpSession(socket, { createClient, authorize, resolveConnection, screenSize,
  errorPayload, timeoutMs = 30000 }) {
  let client = null;
  let state = 'idle';
  let timer = null;
  let screen = null;
  const finish = (event, payload) => {
    if (state === 'closed') return;
    state = 'closed';
    clearTimeout(timer);
    const active = client;
    client = null;
    try { active?.close(); } catch (_) { /* Protocol stack already closed. */ }
    finally { active?.bufferLayer?.socket?.destroy(); }
    if (event && socket.connected) socket.emit(event, payload);
    socket.disconnect(true);
  };
  const fail = error => finish('rdp-error', errorPayload(error));
  socket.on('infos', async infos => {
    if (state !== 'idle') return;
    state = 'connecting';
    timer = setTimeout(() => fail({ code: 'RDP_TIMEOUT', message: 'RDP connection timed out' }), timeoutMs);
    timer.unref?.();
    try {
      screen = screenSize(infos?.screen);
      await authorize();
      if (state !== 'connecting') return;
      const connection = await resolveConnection(infos);
      if (state !== 'connecting') return;
      client = createClient({
        domain: connection.domain, userName: connection.username, password: connection.password,
        enablePerf: true, autoLogin: true, decompress: false, screen, locale: 'en', logLevel: 'ERROR',
      });
      client.on('connect', () => {
        if (state !== 'connecting') return;
        clearTimeout(timer);
        state = 'connected';
        socket.emit('rdp-connect');
      });
      client.on('bitmap', bitmap => {
        if (state === 'connected') socket.emit('rdp-bitmap', bitmap);
      });
      client.on('close', () => finish('rdp-close'));
      client.on('error', fail);
      client.connect(connection.address, connection.port);
    } catch (error) { fail(error); }
  });
  const int = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const point = (x, y) => screen && int(x, 0, screen.width - 1) && int(y, 0, screen.height - 1);
  const input = (event, method, validate, transform = args => args) => {
    socket.on(event, (...args) => {
      if (state !== 'connected' || !validate(...args)) return;
      try { client[method](...transform(args)); } catch (error) { fail(error); }
    });
  };
  input('mouse', 'sendPointerEvent', (x, y, button, pressed) =>
    point(x, y) && int(button, 0, 3) && typeof pressed === 'boolean');
  input('wheel', 'sendWheelEvent', (x, y, step, negative, horizontal) =>
    point(x, y) && int(step, 1, 255) && typeof negative === 'boolean' && typeof horizontal === 'boolean');
  input('scancode', 'sendKeyEventScancode', (code, pressed) =>
    (int(code, 1, 127) || int(code, 0xe001, 0xe07f)) && typeof pressed === 'boolean',
    ([code, pressed]) => [code & 0xff, pressed, (code & 0xff00) === 0xe000]);
  input('unicode', 'sendKeyEventUnicode', (code, pressed) =>
    int(code, 0, 65535) && typeof pressed === 'boolean');
  socket.on('disconnect', () => finish());
  return { close: () => finish() };
}
module.exports = { bindRdpSession };
