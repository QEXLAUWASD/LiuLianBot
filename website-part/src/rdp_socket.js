const { Server: SocketIOServer } = require('socket.io');
const rdp = require('@electerm/rdpjs');

const { userHasRemoteAccess } = require('./middleware/remote_auth');
const { normalizeWebRdpInput, RemoteInputError, assertResolvedRemoteHost, allowedRemoteHosts } = require('./services/remote_validation');
const { remoteFeatures } = require('./services/remote_features');

function screenSize(value) {
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < 640 || width > 4096 || height < 480 || height > 2160) {
    throw new RemoteInputError('Invalid screen size');
  }
  return { width, height };
}

function errorPayload(error) {
  const message = typeof error?.message === 'string' && error.message.length <= 300
    ? error.message
    : 'RDP connection failed';
  return { code: error?.code || 'RDP_ERROR', message };
}

function attachRdpServer(server, { sessionMiddleware }) {
  const io = new SocketIOServer(server, {
    serveClient: false,
    maxHttpBufferSize: 1024 * 1024,
  });

  io.engine.use(sessionMiddleware);
  io.use(async (socket, next) => {
    const userId = socket.request.session?.user?.id;
    if (!userId) return next(new Error('Login required'));
    if (!remoteFeatures().rdp) return next(new Error('RDP is disabled'));
    try {
      if (!await userHasRemoteAccess(userId)) return next(new Error('Remote access required'));
      return next();
    } catch (error) {
      console.error('[WebRDP] Authorization check failed:', error);
      return next(new Error('Authorization check failed'));
    }
  });

  io.on('connection', socket => {
    let rdpClient = null;
    let connecting = false;

    socket.on('infos', async infos => {
      if (connecting) return;
      connecting = true;
      if (rdpClient) rdpClient.close();

      try {
        const connection = normalizeWebRdpInput(infos);
        await assertResolvedRemoteHost(connection.host, allowedRemoteHosts(process.env.RDP_ALLOWED_HOSTS), { allowPrivate: true });
        const screen = screenSize(infos?.screen);
        rdpClient = rdp.createClient({
          domain: connection.domain,
          userName: connection.username,
          password: connection.password,
          enablePerf: false,
          autoLogin: true,
          decompress: false,
          screen,
          locale: typeof infos.locale === 'string' ? infos.locale.slice(0, 32) : 'zh-TW',
          logLevel: 'ERROR',
        });
        rdpClient
          .on('connect', () => {
            connecting = false;
            socket.emit('rdp-connect');
          })
          .on('bitmap', bitmap => socket.emit('rdp-bitmap', bitmap))
          .on('close', () => {
            connecting = false;
            socket.emit('rdp-close');
          })
          .on('error', error => {
            connecting = false;
            socket.emit('rdp-error', errorPayload(error));
          })
          .connect(connection.host, connection.port);
      } catch (error) {
        connecting = false;
        socket.emit('rdp-error', errorPayload(error));
      }
    });

    socket.on('mouse', (x, y, button, isPressed) => {
      if (rdpClient) rdpClient.sendPointerEvent(x, y, button, isPressed);
    });
    socket.on('wheel', (x, y, step, isNegative, isHorizontal) => {
      if (rdpClient) rdpClient.sendWheelEvent(x, y, step, isNegative, isHorizontal);
    });
    socket.on('scancode', (code, isPressed) => {
      if (rdpClient) rdpClient.sendKeyEventScancode(code, isPressed);
    });
    socket.on('unicode', (code, isPressed) => {
      if (rdpClient) rdpClient.sendKeyEventUnicode(code, isPressed);
    });
    socket.on('disconnect', () => {
      if (rdpClient) rdpClient.close();
      rdpClient = null;
    });
  });

  return io;
}

module.exports = { attachRdpServer, errorPayload, screenSize };
