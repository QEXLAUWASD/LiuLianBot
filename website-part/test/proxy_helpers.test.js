const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getUpstreamCookies,
  rewriteSetCookie,
  rewriteLocation,
  rewriteHtmlRootUrls,
} = require('../src/proxy_helpers');

test('forwards only cookies belonging to the selected connection', () => {
  const header = [
    'connect.sid=main-session',
    'SID=qbit-session',
    'llb_reports_session=upstream-session',
    'llb_reports_theme=dark',
    'llb_other_session=wrong-target',
  ].join('; ');

  assert.equal(
    getUpstreamCookies(header, 'reports'),
    'SID=qbit-session; session=upstream-session; theme=dark'
  );
});

test('isolates upstream cookies and maps a target base path', () => {
  const result = rewriteSetCookie(
    'connect.sid=abc; Path=/app; Domain=internal.example; HttpOnly; SameSite=Lax',
    'reports',
    'https://internal.example/app/'
  );

  assert.equal(
    result,
    'connect.sid=abc; Path=/connect/reports/; HttpOnly; SameSite=Lax'
  );
});

test('adds a proxy-scoped path when an upstream cookie has no path', () => {
  assert.equal(
    rewriteSetCookie('theme=dark; Secure', 'reports', 'https://internal.example/'),
    'theme=dark; Secure; Path=/connect/reports/'
  );
});

test('rewrites same-origin redirects and preserves external redirects', () => {
  assert.equal(
    rewriteLocation('/app/login?next=home', 'https://internal.example/app/', 'reports'),
    '/connect/reports/login?next=home'
  );
  assert.equal(
    rewriteLocation('https://accounts.example/login', 'https://internal.example/', 'reports'),
    'https://accounts.example/login'
  );
});

test('rewrites loopback alias redirects from upstream apps', () => {
  assert.equal(
    rewriteLocation('http://localhost:4567/webUI', 'http://127.0.0.1:4567/', 'suwayomi'),
    '/connect/suwayomi/webUI'
  );
  assert.equal(
    rewriteLocation('http://127.0.0.1:4567/webUI', 'http://internal.example:4567/', 'suwayomi'),
    '/connect/suwayomi/webUI'
  );
  assert.equal(
    rewriteLocation('http://localhost:9999/webUI', 'http://127.0.0.1:4567/', 'suwayomi'),
    'http://localhost:9999/webUI'
  );
});

test('marks redirects outside the configured target base path', () => {
  assert.equal(
    rewriteLocation('/login', 'https://example.test/app/', 'reports'),
    '/connect/reports/__upstream_root__/login'
  );
});

test('rewrites root-relative HTML asset and API URLs through the upstream root marker', () => {
  const html = [
    '<link rel="stylesheet" href="/index-TZrNw7dA.css">',
    '<script type="module" src="/index-BA7g9K9t.js"></script>',
    '<script src="/polyfills-KOa4MKuO.js"></script>',
    '<link rel="icon" href="/favicon.svg">',
    '<form action="/api/graphql"></form>',
  ].join('');

  assert.equal(
    rewriteHtmlRootUrls(html, 'suwayomi'),
    [
      '<link rel="stylesheet" href="/connect/suwayomi/__upstream_root__/index-TZrNw7dA.css">',
      '<script type="module" src="/connect/suwayomi/__upstream_root__/index-BA7g9K9t.js"></script>',
      '<script src="/connect/suwayomi/__upstream_root__/polyfills-KOa4MKuO.js"></script>',
      '<link rel="icon" href="/connect/suwayomi/__upstream_root__/favicon.svg">',
      '<form action="/connect/suwayomi/__upstream_root__/api/graphql"></form>',
    ].join('')
  );
});

test('rewrites relative HTML asset URLs against the proxied request path', () => {
  const html = [
    '<link rel="stylesheet" href="index-TZrNw7dA.css">',
    '<script type="module" src="index-BA7g9K9t.js"></script>',
    '<script src="./polyfills-KOa4MKuO.js"></script>',
    '<link rel="manifest" href="assets/site.webmanifest">',
  ].join('');

  assert.equal(
    rewriteHtmlRootUrls(html, 'suwayomi', '/webUI/'),
    [
      '<link rel="stylesheet" href="/connect/suwayomi/webUI/index-TZrNw7dA.css">',
      '<script type="module" src="/connect/suwayomi/webUI/index-BA7g9K9t.js"></script>',
      '<script src="/connect/suwayomi/webUI/polyfills-KOa4MKuO.js"></script>',
      '<link rel="manifest" href="/connect/suwayomi/webUI/assets/site.webmanifest">',
    ].join('')
  );
});

test('preserves anchors, protocol-relative, absolute, and already proxied HTML URLs', () => {
  const html = [
    '<script src="//cdn.example.test/app.js"></script>',
    '<link href="/connect/suwayomi/index.css">',
    '<link href="https://cdn.example.test/app.css">',
    '<a href="#main">',
    '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">',
  ].join('');

  assert.equal(rewriteHtmlRootUrls(html, 'suwayomi'), html);
});

test('preserves non-url content attributes such as viewport metadata', () => {
  const html = '<meta name="viewport" content="minimum-scale=1, initial-scale=1, viewport-fit=cover, width=device-width">';

  assert.equal(rewriteHtmlRootUrls(html, 'suwayomi'), html);
});
