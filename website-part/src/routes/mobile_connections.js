const express = require('express');
const { getConnectionAccessBySlug } = require('../db');
const { requireApiAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/capabilities', (_req, res) => {
  res.set('Cache-Control', 'no-cache').json(require('../services/api_catalog').apiCatalog);
});

router.get('/openapi', (_req, res) => {
  res.set('Cache-Control', 'no-cache').json(require('../services/openapi').createOpenApi(process.env.SESSION_COOKIE_NAME || 'connect.sid'));
});

router.use(requireApiAuth);

router.get('/connections/:slug', async (req, res, next) => {
  try {
    const access = await getConnectionAccessBySlug(req.params.slug, req.session.user.id);
    if (!access) return res.status(404).json({ error: 'Website connection not found' });
    if (!access.allowed) return res.status(403).json({ error: 'Website connection access denied' });
    const { id, name, slug, description } = access.connection;
    res.set('Cache-Control', 'no-store').json({
      connection: { id, name, slug, description, path: proxiedConnectionPath(slug), nativeIntegration: null },
    });
  } catch (error) { next(error); }
});

function proxiedConnectionPath(slug) {
  return `/connect/${encodeURIComponent(slug)}/`;
}

router.get('/connect/:slug', async (req, res) => {
  try {
    const access = await getConnectionAccessBySlug(req.params.slug, req.session.user.id);
    if (!access) {
      return res.status(404).json({ error: 'Website connection not found' });
    }
    if (!access.allowed) {
      return res.status(403).json({ error: 'Website connection access denied' });
    }

    return res.redirect(302, proxiedConnectionPath(access.connection.slug));
  } catch (err) {
    console.error('[MobileConnections] GET /connect/:slug error:', err);
    return res.status(500).json({ error: 'Failed to open website connection' });
  }
});

router.proxiedConnectionPath = proxiedConnectionPath;

module.exports = router;
