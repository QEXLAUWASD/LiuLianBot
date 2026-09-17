import { useCallback, useRef, useState } from 'react';

// Mirrors the previous `withBusyControl` helper: one in-flight mutation per
// control, disabled and aria-busy while it runs.
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const run = useCallback(async operation => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await operation();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
