const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { sqlInjectionGuard } = require('./middleware/security');
const { requireAdmin } = require('./middleware/adminAuth');
const authRoutes = require('./routes/auth');
const rollerRoutes = require('./routes/roller');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Security middleware ----------

// Body parsers (must come before sqlInjectionGuard so req.body is parsed)
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// SQL injection guard — scans req.body/query/params after parsing
app.use(sqlInjectionGuard);
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'liulianbot-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,               // prevent client-side JS access
    sameSite: 'strict',           // CSRF protection
    secure: false,                // set true when using HTTPS
  },
}));

// API Routes (protected by sqlInjectionGuard above)
app.use('/api/auth', authRoutes);
app.use('/api/roller', rollerRoutes);
app.use('/api/admin', adminRoutes);

// Auth check middleware for pages
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login.html');
}

// Public pages (no auth required)
app.get('/roller.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'roller.html'));
});

// Protected pages
app.get('/index.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin page (require auth + admin role)
app.get('/admin.html', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Root redirect
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/index.html');
  } else {
    res.redirect('/login.html');
  }
});

// 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`LiuLianBot Website running at http://localhost:${PORT}`);
});
