import assert from 'node:assert/strict';
import test from 'node:test';

import { TermsPage, consentDestination } from '../../frontend/src/pages/TermsPage.jsx';
import { click, flush, mockFetch, render, setupDom, stubLocation } from '../support/react.mjs';

async function acceptTerms(next) {
  const location = stubLocation({
    href: '/terms.html',
    search: `?next=${encodeURIComponent(next)}`,
  });
  const dom = setupDom('<div id="root"></div>', { location });
  const fetchMock = mockFetch({
    'GET /api/auth/terms-status': { payload: { required: true } },
    'GET /api/auth/me': { payload: { loggedIn: true, user: { termsAccepted: false } } },
    'POST /api/auth/terms': { payload: { success: true } },
  });
  const view = render(<TermsPage />);
  try {
    await flush();
    assert.equal(dom.document.getElementById('termsConsent').hidden, false);
    click(dom.document.getElementById('confirmTerms'));
    click(dom.document.getElementById('acceptTerms'));
    await flush();
    assert.deepEqual(fetchMock.callsTo('POST', '/api/auth/terms')[0].body, { termsAccepted: true });
    return location.href;
  } finally {
    view.unmount();
    fetchMock.restore();
    dom.cleanup();
  }
}

test('direct terms links cannot redirect outside the site after accepting consent', async () => {
  for (const target of [
    'https://elsewhere.test',
    '//elsewhere.test',
    '/\\elsewhere.test',
    '/\n/elsewhere.test',
    '/..//elsewhere.test',
    '/%2e%2e//elsewhere.test',
  ]) {
    assert.equal(await acceptTerms(target), '/index.html', target);
  }
});

test('accepting terms preserves a safe connection path including query and fragment', async () => {
  const target = '/connect/nas/files?view=list&sort=name#recent';
  assert.equal(await acceptTerms(target), target);
  assert.equal(consentDestination(''), '/index.html');
  assert.equal(consentDestination('?next=%2Ffiles.html'), '/files.html');
});
