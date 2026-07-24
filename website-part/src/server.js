require('dotenv').config();

const { createApp } = require('./app');
const { buildSessionOptions } = require('./config/session');
const { getPool } = require('./db');
const { MySqlSessionStore } = require('./session_store');

const PORT = process.env.PORT || 3000;

async function startServer() {
  await getPool();
  const auth = require('./routes/auth');
  const roller = require('./routes/roller');
  const admin = require('./routes/admin');
  const adminConnections = require('./routes/admin_connections');
  const connections = require('./routes/connections');
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
      events,
      connectionProxy,
    },
  });
  const server = app.listen(PORT);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  console.log(`LiuLianBot Website running at http://localhost:${PORT}`);

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
