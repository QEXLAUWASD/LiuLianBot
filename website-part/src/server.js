require('dotenv').config();
const session = require('express-session');

const { createApp } = require('./app');
const { buildListenOptions } = require('./config/server');
const { buildSessionOptions } = require('./config/session');
const { getPool, closePool } = require('./db');
const { MySqlSessionStore } = require('./session_store');
const { attachSshServer } = require('./ssh_server');
const { attachRdpServer } = require('./rdp_socket');
const { attachChromiumServer } = require('./chromium_server');

async function startServer() {
  await getPool();
  const auth = require('./routes/auth');
  const roller = require('./routes/roller');
  const admin = require('./routes/admin');
  const adminConnections = require('./routes/admin_connections');
  const connections = require('./routes/connections');
  const mobileConnections = require('./routes/mobile_connections');
  const events = require('./routes/events');
  const rdp = require('./routes/rdp');
  const remoteProfile = require('./routes/remote_profile');
  const connectionProxy = require('./routes/connection_proxy');
  const pageVisibility = require('./routes/page_visibility');
  const guildManager = require('./routes/guild_manager');
  const vlessTunnel = require('./routes/vless_tunnel');
  const sessionStore = new MySqlSessionStore();
  const sessionOptions = buildSessionOptions(process.env, sessionStore);
  const sessionMiddleware = session(sessionOptions);
  const app = createApp({
    sessionOptions,
    sessionMiddleware,
    routers: {
      auth,
      roller,
      admin,
      adminConnections,
      connections,
      mobileConnections,
      events,
      rdp,
      remoteProfile,
      connectionProxy,
      pageVisibility,
      guildManager,
      vlessTunnel,
    },
  });
  const listenOptions = buildListenOptions(process.env);
  const server = app.listen(listenOptions);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  console.log(
    `LiuLianBot Website listening on ${listenOptions.host || 'all interfaces'}:${listenOptions.port}`,
  );

  connectionProxy.attachWebSocketServer(server, {
    sessionStore,
    sessionCookieName: sessionOptions.name,
    sessionSecret: sessionOptions.secret,
  });
  attachSshServer(server, {
    sessionStore,
    sessionCookieName: sessionOptions.name,
    sessionSecret: sessionOptions.secret,
  });
  server.rdpServer = attachRdpServer(server, { sessionMiddleware });
  const chromiumServer = attachChromiumServer(server, {
    sessionStore,
    sessionCookieName: sessionOptions.name,
    sessionSecret: sessionOptions.secret,
  });
  server.chromiumServer = chromiumServer;
  sessionStore.startCleanup();
  const closeResources = () => {
    sessionStore.stopCleanup();
    chromiumServer.closeAll();
  };
  server.once('close', closeResources);
  server.once('error', err => {
    closeResources();
    closePool().catch(closeErr => {
      console.error('[Server] Database pool shutdown failed:', closeErr);
    });
    console.error('[Server] HTTP server error:', err);
  });

  return server;
}

async function stopServer(server) {
  server?.chromiumServer?.closeAll();
  if (server?.rdpServer) {
    await new Promise(resolve => server.rdpServer.close(resolve));
  }
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  }
  await closePool();
}

if (require.main === module) {
  let server = null;
  let shuttingDown = false;
  const shutdown = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] Received ${signal}; shutting down`);
    stopServer(server).catch(err => {
      console.error('[Server] Shutdown failed:', err);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  startServer()
    .then(startedServer => { server = startedServer; })
    .catch(err => {
      console.error('[Server] Startup failed:', err);
      process.exitCode = 1;
    });
}

module.exports = { startServer, stopServer };
