import { ApiError, requestJSON } from './apiClient.mjs';

export function createAuthState(loader) {
  let cachedValue;
  let hasCachedValue = false;
  let pendingLoad = null;
  let generation = 0;
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener(cachedValue);
  }

  return {
    load() {
      if (hasCachedValue) return Promise.resolve(cachedValue);
      if (pendingLoad) return pendingLoad;

      const loadGeneration = generation;
      let loadResult;
      try {
        loadResult = loader();
      } catch (error) {
        loadResult = Promise.reject(error);
      }

      const currentLoad = Promise.resolve(loadResult)
        .then(value => {
          if (generation === loadGeneration) {
            cachedValue = value;
            hasCachedValue = true;
          }
          return value;
        })
        .finally(() => {
          if (pendingLoad === currentLoad) pendingLoad = null;
        });

      pendingLoad = currentLoad;
      return currentLoad;
    },

    reset() {
      generation += 1;
      cachedValue = undefined;
      hasCachedValue = false;
      pendingLoad = null;
      notify();
    },

    peek() {
      return hasCachedValue ? cachedValue : undefined;
    },

    // Applies a local update (for example a renamed account) to the cached
    // payload so every mounted view re-renders with the new value.
    patch(updater) {
      if (!hasCachedValue) return;
      cachedValue = updater(cachedValue);
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const authState = createAuthState(() => requestJSON('/api/auth/me'));

export async function logout({
  request = requestJSON,
  location = globalThis.location,
} = {}) {
  const result = await request('/api/auth/logout', { method: 'POST' });

  if (result?.success !== true) {
    throw new ApiError('Logout was not confirmed by the server', {
      code: 'LOGOUT_NOT_CONFIRMED',
    });
  }

  authState.reset();
  location.href = '/login.html';
}
