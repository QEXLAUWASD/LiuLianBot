const { findUserById, getUserRoleNames } = require('../db');
const { termsRequired } = require('../services/terms_config');

function allowedRemoteGroups(value = process.env.REMOTE_ALLOWED_GROUPS) {
  const configured = String(value || 'admin')
    .split(',')
    .map(group => group.trim().toLowerCase())
    .filter(group => /^[a-z0-9_-]{1,50}$/.test(group));
  return new Set(configured);
}

function hasRemoteAccess(groupNames, groups = allowedRemoteGroups()) {
  return groupNames.some(group => groups.has(String(group).toLowerCase()));
}

async function userHasRemoteAccess(userId) {
  const user = await findUserById(userId);
  return Boolean(user) && (!termsRequired() || Boolean(user.terms_accepted_at)) && hasRemoteAccess(await getUserRoleNames(userId));
}

async function requireRemoteAccess(req, res, next) {
  if (!req.session?.user?.id) return res.status(401).json({ error: 'Login required' });
  try {
    if (!await userHasRemoteAccess(req.session.user.id)) {
      return res.status(403).json({ error: 'Remote access required' });
    }
    return next();
  } catch (err) {
    console.error('[RemoteAuth] Authorization check failed:', err);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
}

async function requireRemotePageAccess(req, res, next) {
  if (!req.session?.user?.id) return res.redirect('/login.html');
  try {
    if (!await userHasRemoteAccess(req.session.user.id)) {
      return res.status(403).send('Remote access required');
    }
    return next();
  } catch (err) {
    console.error('[RemoteAuth] Authorization check failed:', err);
    return res.status(500).send('Authorization check failed');
  }
}

module.exports = {
  allowedRemoteGroups,
  hasRemoteAccess,
  userHasRemoteAccess,
  requireRemoteAccess,
  requireRemotePageAccess,
};
