require('dotenv').config();

const { createApp } = require('./app');
const { buildSessionOptions } = require('./config/session');
const { MySqlSessionStore } = require('./session_store');

const PORT = process.env.PORT || 3000;

function startServer() {
  const auth = require('./routes/auth');
  const roller = require('./routes/roller');
  const admin = require('./routes/admin');
  const adminConnections = require('./routes/admin_connections');
  const connections = require('./routes/connections');
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
      connectionProxy,
    },
  });
  const server = app.listen(PORT, () => {
    console.log(`LiuLianBot Website running at http://localhost:${PORT}`);
  });

  connectionProxy.attachWebSocketServer(server, {
    sessionStore,
    sessionCookieName: sessionOptions.name,
    sessionSecret: sessionOptions.secret,
  });

  return server;
}

if (require.main === module) startServer();

module.exports = { startServer };
