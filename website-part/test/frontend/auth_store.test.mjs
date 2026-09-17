import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthState, logout } from '../../frontend/src/lib/authStore.mjs';

test('createAuthState shares one in-flight load and reuses its successful result', async () => {
  let calls = 0;
  let resolveLoad;
  const state = createAuthState(() => {
    calls += 1;
    return new Promise(resolve => {
      resolveLoad = resolve;
    });
  });

  const first = state.load();
  const second = state.load();
  assert.equal(calls, 1);
  assert.equal(first, second);

  resolveLoad({ loggedIn: true, user: { username: 'alice' } });
  assert.deepEqual(await first, { loggedIn: true, user: { username: 'alice' } });
  assert.deepEqual(await state.load(), { loggedIn: true, user: { username: 'alice' } });
  assert.equal(calls, 1);
});

test('a failed load is not cached and can be retried', async () => {
  let calls = 0;
  const state = createAuthState(() => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ loggedIn: false });
  });

  await assert.rejects(state.load(), /offline/);
  assert.deepEqual(await state.load(), { loggedIn: false });
  assert.equal(calls, 2);
});

test('reset clears the cache, notifies subscribers and drops late results', async () => {
  const resolvers = [];
  const state = createAuthState(() => new Promise(resolve => {
    resolvers.push(resolve);
  }));
  const seen = [];
  const unsubscribe = state.subscribe(value => seen.push(value));

  const pending = state.load();
  state.reset();
  resolvers[0]({ loggedIn: true });
  await pending;

  assert.equal(state.peek(), undefined);
  assert.deepEqual(seen, [undefined]);

  state.patch(() => ({ loggedIn: true }));
  assert.equal(state.peek(), undefined, 'a reset store ignores patches until it loads again');

  unsubscribe();
  const second = state.load();
  resolvers[1]({ loggedIn: true });
  await second;
  assert.deepEqual(state.peek(), { loggedIn: true });

  state.patch(current => ({ ...current, user: { username: 'bob' } }));
  assert.deepEqual(state.peek(), { loggedIn: true, user: { username: 'bob' } });
  assert.equal(seen.length, 1, 'unsubscribed listeners stop receiving updates');
});

test('logout requires server confirmation, clears the cache and redirects', async () => {
  const location = { href: '/index.html' };
  const requests = [];
  const request = async (url, options) => {
    requests.push({ url, options });
    return { success: true };
  };

  await logout({ request, location });

  assert.deepEqual(requests, [{ url: '/api/auth/logout', options: { method: 'POST' } }]);
  assert.equal(location.href, '/login.html');
});

test('logout surfaces an unconfirmed response instead of redirecting', async () => {
  const location = { href: '/index.html' };

  await assert.rejects(
    logout({ request: async () => ({ success: false }), location }),
    /not confirmed/,
  );

  assert.equal(location.href, '/index.html');
});
