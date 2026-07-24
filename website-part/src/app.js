const express = require('express');
const session = require('express-session');
const { rateLimit } = require('express-rate-limit');
const path = require('path');

const { requirePageAuth } = require('./middleware/auth');
const { AUTH_RATE_LIMIT } = require('./middleware/auth_rate_limit');
const { requireAdmin } = require('./middleware/admin_auth');
const { requestContext } = require('./middleware/request_context');
const { errorHandler } = require('./middleware/error_handler');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp({ sessionOptions, routers }) {
  const app = express();

  if (sessionOptions.cookie.secure) app.set('trust proxy', 1);
  app.use(session(sessionOptions));
  app.use('/api', requestContext);
  app.use('/api', express.json({ limit: '16kb' }));
  app.use('/api', express.urlencoded({ extended: false, limit: '16kb' }));
  app.use('/api/admin/connections', routers.adminConnections);
  const authRateLimiter = rateLimit(AUTH_RATE_LIMIT);
  app.use('/api/auth/login', authRateLimiter);
  app.use('/api/auth/register', authRateLimiter);
  app.use('/api/auth', routers.auth);
  app.use('/api/roller', routers.roller);
  if (routers.events) app.use('/api/events', routers.events);
  app.use('/api/admin', routers.admin);
  app.use('/api/connections', routers.connections);

  app.get('/roller.html', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'roller.html'));
  });
  app.get('/index.html', requirePageAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
  app.get('/account.html', requirePageAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'account.html'));
  });
  app.get('/events.html', requirePageAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'events.html'));
  });
  app.get('/admin.html', requirePageAuth, requireAdmin, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
  });

  app.use('/connect/:slug', routers.connectionProxy);
  app.use(express.static(PUBLIC_DIR, { index: false }));
  app.get('/', (req, res) => {
    res.redirect(req.session.user ? '/index.html' : '/login.html');
  });
  app.use(errorHandler);
  app.use((req, res) => {
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
  });

  return app;
}

module.exports = { createApp };
