const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { findUserByUsername, createUser } = require('../db');
const {
  AccountInputError,
  normalizeUsername,
  validateNewPassword,
} = require('../services/account_validation');
const { establishUserSession } = require('../services/session');

const REMEMBER_LOGIN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'connect.sid';

// ---------- helper: generate a short unique id ----------
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Register
router.post('/register', async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = validateNewPassword(req.body.password);

    const existing = await findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = generateId();
    const user = await createUser(id, username, hashedPassword);

    await establishUserSession(req, user);
    res.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    if (err instanceof AccountInputError) {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password, remember = false } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (typeof remember !== 'boolean') {
      return res.status(400).json({ error: 'Remember me must be a boolean' });
    }
    const user = await findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    await establishUserSession(
      req,
      user,
      remember ? REMEMBER_LOGIN_MAX_AGE : null
    );
    res.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ success: true });
  });
});

// Check current session (with role info)
router.get('/me', async (req, res) => {
  if (!req.session.user) {
    return res.json({ loggedIn: false });
  }
  try {
    const { findUserById } = require('../db');
    const user = await findUserById(req.session.user.id);
    if (!user) {
      req.session.destroy(() => {});
      return res.json({ loggedIn: false });
    }
    res.json({
      loggedIn: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role_name || 'user',
      },
    });
  } catch (err) {
    // Fallback: return session data without role
    res.json({
      loggedIn: true,
      user: {
        id: req.session.user.id,
        username: req.session.user.username,
        role: 'user',
      },
    });
  }
});

router.use(require('./account'));

module.exports = router;
