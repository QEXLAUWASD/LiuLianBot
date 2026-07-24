const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  findUserByUsername,
  findUserCredentialsById,
  updateUsername,
  updatePasswordHash,
  findUserById,
  createDiscordLinkCode,
  unlinkDiscordUser,
} = require('../db');
const {
  AccountInputError,
  normalizeUsername,
  validatePasswordChange,
} = require('../services/account_validation');
const { requireApiAuth } = require('../middleware/auth');
const { revokeOtherUserSessions } = require('../services/session');

const router = express.Router();

router.get('/discord-link', requireApiAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.session.user.id);
    res.json({ linked: Boolean(user?.discord_user_id), discordUserId: user?.discord_user_id || null });
  } catch (err) { next(err); }
});

router.post('/discord-link', requireApiAuth, async (req, res, next) => {
  try {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await createDiscordLinkCode(req.session.user.id, codeHash, expiresAt);
    res.status(201).json({ code, expiresAt: expiresAt.toISOString() });
  } catch (err) { next(err); }
});

router.delete('/discord-link', requireApiAuth, async (req, res, next) => {
  try {
    await unlinkDiscordUser(req.session.user.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

async function verifyCurrentPassword(userId, currentPassword) {
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    throw new AccountInputError('Current password is required');
  }

  const user = await findUserCredentialsById(userId);
  if (!user) return null;

  const valid = await bcrypt.compare(currentPassword, user.password);
  return valid ? user : false;
}

router.put('/username', requireApiAuth, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const user = await verifyCurrentPassword(
      req.session.user.id,
      req.body.currentPassword
    );

    if (user === null) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Login required' });
    }
    if (user === false) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (user.username === username) {
      return res.status(400).json({ error: 'New username must be different' });
    }

    const existing = await findUserByUsername(username);
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const updated = await updateUsername(user.id, username);
    req.session.user.username = updated.username;
    res.json({
      success: true,
      user: { id: updated.id, username: updated.username },
    });
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

router.put('/password', requireApiAuth, async (req, res, next) => {
  try {
    const passwords = validatePasswordChange(
      req.body.currentPassword,
      req.body.newPassword,
      req.body.confirmPassword
    );
    const user = await verifyCurrentPassword(
      req.session.user.id,
      passwords.currentPassword
    );

    if (user === null) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Login required' });
    }
    if (user === false) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (await bcrypt.compare(passwords.newPassword, user.password)) {
      return res.status(400).json({ error: 'New password must be different' });
    }

    const hashedPassword = await bcrypt.hash(passwords.newPassword, 10);
    await updatePasswordHash(user.id, hashedPassword);
    await revokeOtherUserSessions(req, user.id);
    res.json({ success: true });
  } catch (err) {
    if (err instanceof AccountInputError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
