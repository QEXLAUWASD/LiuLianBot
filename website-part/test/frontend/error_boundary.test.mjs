import assert from 'node:assert/strict';
import test, { after } from 'node:test';

import { ErrorBoundary } from '../../frontend/src/components/ErrorBoundary.jsx';
import { click, cleanupAll, flush, render, setupDom } from '../support/react.mjs';

after(() => cleanupAll());

function Exploding({ explode }) {
  if (explode) throw new Error('boom');
  return <p className="ok-state">recovered</p>;
}

test('a page error shows the fallback and can be retried', async () => {
  const dom = setupDom('<div id="root"></div>');
  const originalError = console.error;
  console.error = () => {};

  try {
    const root = render(
      <ErrorBoundary>
        <Exploding explode />
      </ErrorBoundary>,
    );
    await flush();

    assert.equal(dom.document.querySelector('.error-page h1').textContent, 'Something went wrong');
    assert.equal(dom.document.querySelector('a[href="/"]').textContent, 'Go Home');

    // The retry button clears the error state and re-renders the children.
    root.rerender(
      <ErrorBoundary>
        <Exploding explode={false} />
      </ErrorBoundary>,
    );
    click(dom.document.querySelector('.error-actions button'));
    await flush();
    assert.equal(dom.document.querySelector('.ok-state')?.textContent, 'recovered');
  } finally {
    console.error = originalError;
    dom.cleanup();
  }
});
