require('dotenv').config();

const { createApp } = require('./app');
const { MySqlSessionStore } = require('./session_store');

const PORT = process.env.PORT || 3000;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'connect.sid';
const SESSION_SECRET = process.env.SESSION_SECRET || 'liulianbot-secret-key-change-in-production';

function startServer() {
  const auth = require('./routes/auth');
  const roller = require('./routes/roller');
  const admin = require('./routes/admin');
  const adminConnections = require('./routes/admin_connections');
  const connections = require('./routes/connections');
  const connectionProxy = require('./routes/connection_proxy');
  const sessionStore = new MySqlSessionStore();
  const sessionOptions = {
    store: sessionStore,
    name: SESSION_COOKIE_NAME,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
    },
  };
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
    sessionCookieName: SESSION_COOKIE_NAME,
    sessionSecret: SESSION_SECRET,
  });

  return server;
}

if (require.main === module) startServer();

module.exports = { startServer };
