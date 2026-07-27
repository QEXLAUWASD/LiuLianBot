const express = require('express');
const { getConnectionAccessBySlug } = require('../db');
const { requireApiAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireApiAuth);

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
