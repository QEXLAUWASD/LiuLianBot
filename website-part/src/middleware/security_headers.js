// Baseline browser security headers for every first-party response.
//
// The frontend is a compiled bundle with no inline scripts or styles, so the
// Content-Security-Policy can stay strict without a dependency. Requests that
// are proxied to a linked third-party website (`/connect/<slug>`) are skipped:
// applying our policy to someone else's HTML would break their own assets.
const CSP_DIRECTIVES = Object.freeze([
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  // React and the remote desktop views set element styles at runtime; allow the
  // inline style attribute while still blocking injected <style> sources.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
]);

const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join('; ');

function isProxiedConnection(pathname) {
  return pathname === '/connect' || pathname.startsWith('/connect/');
}

function securityHeaders(req, res, next) {
  const pathname = req.path || req.url || '';
  if (isProxiedConnection(pathname)) return next();

  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // Only advertise HSTS when this request actually arrived over TLS; sending it
  // on plain HTTP has no effect and can confuse LAN deployments.
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return next();
}

module.exports = {
  securityHeaders,
  CONTENT_SECURITY_POLICY,
  isProxiedConnection,
};
