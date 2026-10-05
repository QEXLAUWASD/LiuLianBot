import { useEffect, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';

let pendingVisibility = null;

function loadPageVisibility() {
  if (!pendingVisibility) {
    pendingVisibility = requestJSON('/api/page-visibility').finally(() => {
      pendingVisibility = null;
    });
  }
  return pendingVisibility;
}

// Page visibility is a soft gate: a failure falls back to the built-in defaults
// instead of hiding the navigation. Only in-flight lookups are shared, so later
// mounts still receive current permissions after an account or settings change.
export function usePageVisibility() {
  const [pages, setPages] = useState(null);

  useEffect(() => {
    let active = true;
    loadPageVisibility()
      .then(data => {
        if (active && data?.pages) setPages(data.pages);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return pages;
}
