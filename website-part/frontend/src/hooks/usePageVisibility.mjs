import { useEffect, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';

// Page visibility is a soft gate: a failure falls back to the built-in defaults
// instead of hiding the navigation.
export function usePageVisibility() {
  const [pages, setPages] = useState(null);

  useEffect(() => {
    let active = true;
    requestJSON('/api/page-visibility')
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
