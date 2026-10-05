export function authDestination(search = globalThis.location?.search || '') {
  const next = new URLSearchParams(search).get('next');
  // Both protected pages and proxied connections pass a return path. Reject
  // protocol-relative URLs and browser-normalized backslashes/control bytes.
  if (!next?.startsWith('/') || next.startsWith('//') || /[\\\u0000-\u0020]/.test(next)) {
    return '/index.html';
  }
  const destination = new URL(next, 'https://liulianbot.local');
  // Normalizing dot segments can turn /..//host into a protocol-relative path.
  if (destination.pathname.startsWith('//') || ['/login.html', '/terms.html'].includes(destination.pathname)) {
    return '/index.html';
  }
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
