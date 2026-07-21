/**
 * Admin authorization middleware.
 * Must be placed AFTER session middleware and requireAuth.
 * Checks that the logged-in user has the 'admin' role.
 */
const { findUserById } = require('../db');

async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Please login first' });
  }

  try {
    const user = await findUserById(req.session.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.role_name !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Attach full user info for downstream use
    req.adminUser = user;
    next();
  } catch (err) {
    console.error('[AdminAuth] Error:', err);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
}

module.exports = { requireAdmin };
