const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getUpstreamCookies,
  rewriteSetCookie,
  rewriteLocation,
} = require('../src/proxy_helpers');

test('forwards only cookies belonging to the selected connection', () => {
  const header = [
    'connect.sid=main-session',
    'llb_reports_session=upstream-session',
    'llb_reports_theme=dark',
    'llb_other_session=wrong-target',
  ].join('; ');

  assert.equal(
    getUpstreamCookies(header, 'reports'),
    'session=upstream-session; theme=dark'
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
    'llb_reports_connect.sid=abc; Path=/connect/reports/; HttpOnly; SameSite=Lax'
  );
});

test('adds a proxy-scoped path when an upstream cookie has no path', () => {
  assert.equal(
    rewriteSetCookie('theme=dark; Secure', 'reports', 'https://internal.example/'),
    'llb_reports_theme=dark; Secure; Path=/connect/reports/'
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
