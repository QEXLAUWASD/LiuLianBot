const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { requireConnectionAccess } = require('../middleware/connection_auth');
const { getUpstreamCookies, rewriteSetCookie, rewriteLocation } = require('../proxy_helpers');

const router = express.Router({ mergeParams: true });

router.use(requireConnectionAccess);

router.use((req, res, next) => {
  const expectedPath = `/connect/${req.params.slug}`;
  const requestPath = new URL(req.originalUrl, 'http://localhost').pathname;
  if (requestPath === expectedPath) {
    return res.redirect(302, `${expectedPath}/`);
  }
  return next();
});

const proxy = createProxyMiddleware({
  router: req => req.connectionTarget.target_url,
  changeOrigin: true,
  xfwd: true,
  secure: process.env.PROXY_ALLOW_SELF_SIGNED !== 'true',
  proxyTimeout: 30000,
  timeout: 30000,
  on: {
    proxyReq(proxyReq, req) {
      const cookies = getUpstreamCookies(proxyReq.getHeader('cookie'), req.params.slug);
      if (cookies) proxyReq.setHeader('cookie', cookies);
      else proxyReq.removeHeader('cookie');
      proxyReq.setHeader('x-forwarded-prefix', `/connect/${req.params.slug}`);
    },
    proxyRes(proxyRes, req) {
      const setCookies = proxyRes.headers['set-cookie'];
      if (setCookies) {
        proxyRes.headers['set-cookie'] = setCookies.map(cookie =>
          rewriteSetCookie(cookie, req.params.slug, req.connectionTarget.target_url)
        );
      }

      if (proxyRes.headers.location) {
        proxyRes.headers.location = rewriteLocation(
          proxyRes.headers.location,
          req.connectionTarget.target_url,
          req.params.slug
        );
      }
    },
    error(err, req, res) {
      console.error(`[ConnectionProxy] ${req.params.slug}:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('The target website is unavailable');
    },
  },
});

router.use(proxy);

module.exports = router;
