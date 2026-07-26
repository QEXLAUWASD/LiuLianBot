function getUpstreamCookies(cookieHeader, slug) {
  if (!cookieHeader) return '';
  const prefix = `llb_${slug}_`;
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(part => part.startsWith(prefix) && part.includes('='))
    .map(part => part.slice(prefix.length))
    .join('; ');
}

function rewriteSetCookie(cookie, slug, targetUrl) {
  const proxyBase = `/connect/${slug}`;
  const parts = cookie.split(';').map(part => part.trim());
  const [nameValue, ...attributes] = parts;
  const rewritten = [`llb_${slug}_${nameValue}`];
  const targetPath = new URL(targetUrl).pathname.replace(/\/$/, '');
  let hasPath = false;

  for (const part of attributes) {
    if (/^domain=/i.test(part)) continue;
    if (/^path=/i.test(part)) {
      const upstreamPath = part.slice(part.indexOf('=') + 1).trim();
      const normalizedPath = upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`;
      const isWithinTargetPath = targetPath && (
        normalizedPath === targetPath || normalizedPath.startsWith(`${targetPath}/`)
      );
      const suffix = isWithinTargetPath
        ? normalizedPath.slice(targetPath.length) || '/'
        : normalizedPath;
      rewritten.push(`Path=${proxyBase}${suffix}`);
      hasPath = true;
    } else {
      rewritten.push(part);
    }
  }

  if (!hasPath) rewritten.push(`Path=${proxyBase}/`);
  return rewritten.join('; ');
}

function effectivePort(url) {
  if (url.port) return url.port;
  if (url.protocol === 'https:') return '443';
  if (url.protocol === 'http:') return '80';
  return '';
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '[::1]';
}

function isSameUpstreamOrigin(target, redirected) {
  if (redirected.origin === target.origin) return true;

  return redirected.protocol === target.protocol
    && effectivePort(redirected) === effectivePort(target)
    && isLoopbackHostname(redirected.hostname);
}

function rewriteLocation(location, targetUrl, slug) {
  if (!location) return location;

  try {
    const target = new URL(targetUrl);
    const redirected = new URL(location, target);
    if (!isSameUpstreamOrigin(target, redirected)) return location;

    const targetPath = target.pathname.replace(/\/$/, '');
    const withinTargetPath = !targetPath
      || redirected.pathname === targetPath
      || redirected.pathname.startsWith(`${targetPath}/`);
    if (!withinTargetPath) {
      return `/connect/${slug}/__upstream_root__${redirected.pathname}${redirected.search}${redirected.hash}`;
    }

    const path = redirected.pathname.slice(targetPath.length) || '/';
    return `/connect/${slug}${path}${redirected.search}${redirected.hash}`;
  } catch (_) {
    return location;
  }
}

module.exports = { getUpstreamCookies, rewriteSetCookie, rewriteLocation };
