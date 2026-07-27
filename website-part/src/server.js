require('dotenv').config();

const { createApp } = require('./app');
const { buildListenOptions } = require('./config/server');
const { buildSessionOptions } = require('./config/session');
const { getPool } = require('./db');
const { MySqlSessionStore } = require('./session_store');

async function startServer() {
  await getPool();
  const auth = require('./routes/auth');
  const roller = require('./routes/roller');
  const admin = require('./routes/admin');
  const adminConnections = require('./routes/admin_connections');
  const connections = require('./routes/connections');
  const mobileConnections = require('./routes/mobile_connections');
  const events = require('./routes/events');
  const connectionProxy = require('./routes/connection_proxy');
  const sessionStore = new MySqlSessionStore();
  const sessionOptions = buildSessionOptions(process.env, sessionStore);
  const app = createApp({
    sessionOptions,
    routers: {
      auth,
      roller,
      admin,
      adminConnections,
      connections,
      mobileConnections,
      events,
      connectionProxy,
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
  sessionStore.startCleanup();
  server.once('close', () => sessionStore.stopCleanup());
  server.once('error', () => sessionStore.stopCleanup());

  return server;
}

if (require.main === module) {
  startServer().catch(err => {
    console.error('[Server] Startup failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { startServer };
