import { useEffect, useState } from 'react';
import { authState } from '../lib/authStore.mjs';

const LOADING = { status: 'loading', user: null, error: null };

// Resolves the single cached `/api/auth/me` lookup shared by the whole page.
export function useAuth() {
  const [state, setState] = useState(LOADING);

  useEffect(() => {
    let active = true;

    const apply = data => setState({
      status: data?.loggedIn ? 'signed-in' : 'signed-out',
      user: data?.user || null,
      error: null,
    });

    const cached = authState.peek();
    if (cached !== undefined) apply(cached);

    const unsubscribe = authState.subscribe(data => {
      if (active && data !== undefined) apply(data);
    });

    authState
      .load()
      .then(data => {
        if (!active) return;
        apply(data);
      })
      .catch(error => {
        if (!active) return;
        setState({ status: 'error', user: null, error });
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}
