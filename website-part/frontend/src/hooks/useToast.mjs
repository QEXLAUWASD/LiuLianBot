import { useCallback, useEffect, useRef, useState } from 'react';

let nextToastId = 1;

export function useToast(durationMs = 3000) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback(id => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    const id = nextToastId++;
    setToasts(current => [...current, { id, message, type }]);
    timers.current.set(id, setTimeout(() => dismiss(id), durationMs));
  }, [dismiss, durationMs]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  return { toasts, showToast, dismiss };
}
