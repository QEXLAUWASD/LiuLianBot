const { getConnectionAccessBySlug } = require('../db');

async function requireConnectionAccess(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.method === 'GET' && req.accepts('html')) {
      const nextUrl = encodeURIComponent(req.originalUrl);
      return res.redirect(`/login.html?next=${nextUrl}`);
    }
    return res.status(401).send('Login required');
  }

  try {
    const result = await getConnectionAccessBySlug(req.params.slug, req.session.user.id);
    if (!result) return res.status(404).send('Website connection not found');
    if (!result.allowed) return res.status(403).send('You do not have access to this website');

    req.connectionTarget = result.connection;
    req.connectionUser = result.user;
    return next();
  } catch (err) {
    console.error('[ConnectionAuth] Error:', err);
    return res.status(500).send('Unable to verify website access');
  }
}

module.exports = { requireConnectionAccess };
