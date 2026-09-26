// Defence-in-depth CSRF check for the JSON API. Session cookies already use
// `SameSite=Strict`, so a browser will not attach them to a cross-site request;
// this middleware additionally rejects state-changing requests whose Origin or
// Sec-Fetch-Site header says they started somewhere else.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function header(req, name) {
  if (typeof req.get === 'function') return req.get(name);
  const value = req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function originMatchesHost(origin, host) {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return parsed.host === host;
  } catch (_) {
    return false;
  }
}

function originCheck(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  // Public share endpoints are read-only capability operations. Native form
  // downloads can arrive through a proxy with a different Host header; the
  // share code, not the caller's origin or session, authorizes these requests.
  if (req.method === 'POST' && /^\/files\/shared\/(?:list|download|archive|archive-all)$/.test(req.path)) {
    return next();
  }

  const origin = header(req, 'origin');
  if (origin && !originMatchesHost(origin, header(req, 'host'))) {
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }

  if (header(req, 'sec-fetch-site') === 'cross-site') {
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }

  return next();
}

module.exports = { originCheck, originMatchesHost };
