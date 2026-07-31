const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { findUserByUsername, createUser, acceptTerms } = require('../db');
const {
  AccountInputError,
  normalizeUsername,
  validateNewPassword,
} = require('../services/account_validation');
const { establishUserSession } = require('../services/session');
const { termsRequired } = require('../services/terms_config');
const { remoteFeatures } = require('../services/remote_features');

const REMEMBER_LOGIN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'connect.sid';
const TERMS_VERSION = '2026-07-31';

function generateId() {
  return crypto.randomUUID();
}

// Register
router.post('/register', async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = validateNewPassword(req.body.password);
    if (termsRequired() && req.body.termsAccepted !== true) {
      return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy' });
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = generateId();
    const user = await createUser(id, username, hashedPassword, termsRequired() ? TERMS_VERSION : null);

    await establishUserSession(req, user);
    res.json({ success: true, user: { id: user.id, username: user.username }, termsRequired: false });
  } catch (err) {
    if (err instanceof AccountInputError) {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    next(err);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { password, remember = false } = req.body;
    const username = normalizeUsername(req.body.username);

    if (typeof password !== 'string' || password.length === 0) {
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
    res.json({ success: true, user: { id: user.id, username: user.username }, termsRequired: termsRequired() && !user.terms_accepted_at });
  } catch (err) {
    if (err instanceof AccountInputError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
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

router.post('/terms', async (req, res, next) => {
  if (!req.session?.user?.id) return res.status(401).json({ error: 'Login required' });
  if (req.body?.termsAccepted !== true) return res.status(400).json({ error: 'Terms acceptance is required' });
  try {
    await acceptTerms(req.session.user.id, TERMS_VERSION);
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

router.get('/terms-status', (req, res) => {
  res.json({ required: termsRequired(), version: TERMS_VERSION });
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
        termsAccepted: !termsRequired() || Boolean(user.terms_accepted_at),
        remoteAvailable: Object.values(remoteFeatures()).some(Boolean),
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
        termsAccepted: false,
        remoteAvailable: false,
      },
    });
  }
});

router.use(require('./account'));

module.exports = router;
