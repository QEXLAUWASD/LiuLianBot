const { Server: SocketIOServer } = require('socket.io');
const rdp = require('@electerm/rdpjs');
const { userHasRemoteAccess } = require('./middleware/remote_auth');
const { normalizeWebRdpInput, RemoteInputError, assertResolvedRemoteHost, allowedRemoteHosts } = require('./services/remote_validation');
const { remoteFeatures } = require('./services/remote_features');
const { bindRdpSession } = require('./services/rdp_session');

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
  return {
    code: typeof error?.code === 'string' && error.code.length <= 64 ? error.code : 'RDP_ERROR',
    message: typeof error?.message === 'string' && error.message.length <= 300
      ? error.message : 'RDP connection failed',
  };
}
async function authorizeSocket(socket, reload = false) {
  if (reload) {
    await new Promise((resolve, reject) => {
      const session = socket.request.session;
      if (!session?.reload) return reject(new Error('Login required'));
      session.reload(error => error ? reject(new Error('Login required')) : resolve());
    });
  }
  const userId = socket.request.session?.user?.id;
  if (!userId) throw new Error('Login required');
  if (!remoteFeatures().rdp) throw new Error('RDP is disabled');
  if (!await userHasRemoteAccess(userId)) throw new Error('Remote access required');
}
async function resolveConnection(infos) {
  const connection = normalizeWebRdpInput(infos);
  const addresses = await assertResolvedRemoteHost(connection.host, allowedRemoteHosts(process.env.RDP_ALLOWED_HOSTS));
  // Pin the validated IP instead of performing a second DNS lookup at connect time.
  return { ...connection, address: addresses[0] };
}
function attachRdpServer(server, { sessionMiddleware }) {
  const io = new SocketIOServer(server, { serveClient: false, maxHttpBufferSize: 1024 * 1024 });
  io.engine.use(sessionMiddleware);
  io.use((socket, next) => {
    authorizeSocket(socket).then(() => next(), error => next(new Error(errorPayload(error).message)));
  });
  io.on('connection', socket => bindRdpSession(socket, {
    createClient: options => rdp.createClient(options),
    authorize: () => authorizeSocket(socket, true),
    resolveConnection, screenSize, errorPayload,
  }));
  return io;
}
module.exports = { attachRdpServer, errorPayload, screenSize };
