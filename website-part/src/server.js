const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { sqlInjectionGuard } = require('./middleware/security');
const { requireAdmin } = require('./middleware/admin_auth');
const authRoutes = require('./routes/auth');
const rollerRoutes = require('./routes/roller');
const adminRoutes = require('./routes/admin');
const adminConnectionRoutes = require('./routes/admin_connections');
const connectionRoutes = require('./routes/connections');
const connectionProxy = require('./routes/connection_proxy');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'connect.sid';

// Session must run before every authenticated API, page, and proxy route.
app.use(session({
  name: SESSION_COOKIE_NAME,
  secret: process.env.SESSION_SECRET || 'liulianbot-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
  },
}));

// Parse and validate LiuLianBot APIs only. Proxied request bodies must remain streams.
app.use('/api', express.json({ limit: '16kb' }));
app.use('/api', express.urlencoded({ extended: false, limit: '16kb' }));
app.use('/api/admin/connections', adminConnectionRoutes);
app.use('/api', sqlInjectionGuard);

app.use('/api/auth', authRoutes);
app.use('/api/roller', rollerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/connections', connectionRoutes);

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  return res.redirect('/login.html');
}

app.get('/roller.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'roller.html'));
});

app.get('/index.html', requireAuth, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/account.html', requireAuth, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'account.html'));
});

app.get('/admin.html', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// Each request, including assets and form submissions, is checked before proxying.
app.use('/connect/:slug', connectionProxy);

// Protected HTML routes above must run before the static file fallback.
app.use(express.static(PUBLIC_DIR, { index: false }));

app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/index.html');
  } else {
    res.redirect('/login.html');
  }
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.listen(PORT, () => {
  console.log(`LiuLianBot Website running at http://localhost:${PORT}`);
});
