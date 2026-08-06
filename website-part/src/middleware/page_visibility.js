const { getVisiblePageKeys } = require('../db');

function requirePageVisibility(pageKey) {
  return async (req, res, next) => {
    try {
      const userId = req.session?.user?.id || null;
      const pages = await getVisiblePageKeys(userId);
      if (pages[pageKey] === true) return next();
      if (!userId) {
        const nextUrl = encodeURIComponent(req.originalUrl || `/${pageKey}.html`);
        return res.redirect(`/login.html?next=${nextUrl}`);
      }
      return res.status(403).send('You do not have access to this page');
    } catch (err) {
      console.error('[PageVisibility] Authorization check failed:', err);
      return res.status(500).send('Unable to verify page access');
    }
  };
}

module.exports = { requirePageVisibility };
