import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

import { ApiError } from '../../public/js/api_client.mjs';
import {
  authState,
  createAuthState,
  logout,
} from '../../public/js/auth_state.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(testDir, '../../public');

test('createAuthState shares one in-flight load and reuses its successful result', async () => {
  let calls = 0;
  let resolveLoad;
  const expected = { loggedIn: true, user: { username: 'tester' } };
  const state = createAuthState(() => {
    calls += 1;
    return new Promise(resolvePromise => {
      resolveLoad = resolvePromise;
    });
  });

  const first = state.load();
  const second = state.load();

  assert.equal(calls, 1);
  assert.equal(first, second);
  resolveLoad(expected);
  assert.equal(await first, expected);
  assert.equal(await state.load(), expected);
  assert.equal(calls, 1);
});

test('createAuthState clears a failed load so a later call can retry', async () => {
  let calls = 0;
  const state = createAuthState(async () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary failure');
    return { loggedIn: false };
  });

  await assert.rejects(state.load(), /temporary failure/);
  assert.deepEqual(await state.load(), { loggedIn: false });
  assert.equal(calls, 2);
});

test('createAuthState reset forces the next load to refresh', async () => {
  let calls = 0;
  const state = createAuthState(async () => ({ version: ++calls }));

  assert.deepEqual(await state.load(), { version: 1 });
  state.reset();
  assert.deepEqual(await state.load(), { version: 2 });
});

test('default authState loads /api/auth/me through requestJSON', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    authState.reset();
  });
  authState.reset();
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ loggedIn: false }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  assert.deepEqual(await authState.load(), { loggedIn: false });
  assert.deepEqual(requests, [{ url: '/api/auth/me', options: {} }]);
});

test('logout redirects only after the server confirms success', async () => {
  const calls = [];
  const location = { href: '/account.html' };

  await logout({
    request: async (url, options) => {
      calls.push({ url, options });
      return { success: true };
    },
    location,
  });

  assert.deepEqual(calls, [{ url: '/api/auth/logout', options: { method: 'POST' } }]);
  assert.equal(location.href, '/login.html');
});

test('logout keeps the current page on network and HTTP failures', async () => {
  for (const error of [
    new ApiError('Network request failed', { status: 0, code: 'NETWORK_ERROR' }),
    new ApiError('Logout failed', { status: 500, code: 'HTTP_ERROR' }),
  ]) {
    const location = { href: '/account.html' };

    await assert.rejects(
      logout({ request: async () => { throw error; }, location }),
      candidate => candidate === error,
    );
    assert.equal(location.href, '/account.html');
  }
});

test('logout rejects success false without redirecting', async () => {
  const location = { href: '/account.html' };

  await assert.rejects(
    logout({ request: async () => ({ success: false }), location }),
    error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'LOGOUT_NOT_CONFIRMED');
      return true;
    },
  );
  assert.equal(location.href, '/account.html');
});

test('four authenticated pages load app.mjs as a module and contain no stale app scripts', async () => {
  for (const filename of ['index.html', 'account.html', 'admin.html', 'roller.html']) {
    const html = await readFile(resolve(publicDir, filename), 'utf8');
    const document = new JSDOM(html).window.document;
    const appScripts = [...document.querySelectorAll('script')]
      .filter(script => script.src.includes('/js/app'));

    assert.equal(appScripts.length, 1, `${filename} should load app once`);
    assert.equal(appScripts[0].getAttribute('src'), '/js/app.mjs');
    assert.equal(appScripts[0].type, 'module');
    assert.doesNotMatch(html, /\/js\/app\.js(?:[?"'])/);
  }
});

test('account page loads account.mjs once as a module with no stale account script', async () => {
  const html = await readFile(resolve(publicDir, 'account.html'), 'utf8');
  const document = new JSDOM(html).window.document;
  const accountScripts = [...document.querySelectorAll('script')]
    .filter(script => script.src.includes('/js/account'));

  assert.equal(accountScripts.length, 1);
  assert.equal(accountScripts[0].getAttribute('src'), '/js/account.mjs');
  assert.equal(accountScripts[0].type, 'module');
  assert.doesNotMatch(html, /\/js\/account\.js(?:[?"'])/);
});

test('app and account consumers use shared auth and logout modules without direct auth fetches', async () => {
  for (const filename of ['app.mjs', 'account.mjs']) {
    const source = await readFile(resolve(publicDir, 'js', filename), 'utf8');
    assert.doesNotMatch(source, /fetch\s*\(\s*['"]\/api\/auth\/me['"]/);
    assert.doesNotMatch(source, /fetch\s*\(\s*['"]\/api\/auth\/logout['"]/);
  }

  const appSource = await readFile(resolve(publicDir, 'js/app.mjs'), 'utf8');
  const accountSource = await readFile(resolve(publicDir, 'js/account.mjs'), 'utf8');
  assert.match(appSource, /import\s*\{[^}]*authState[^}]*logout[^}]*\}\s*from\s*['"]\.\/auth_state\.mjs['"]/s);
  assert.match(accountSource, /import\s*\{\s*authState\s*\}\s*from\s*['"]\.\/auth_state\.mjs['"]/);
});

test('account load error redirects only for ApiError status 401', async () => {
  const { handleAccountLoadError } = await import('../../public/js/account.mjs');

  const unauthorizedLocation = { href: '/account.html' };
  const unauthorizedStatus = { textContent: '', className: 'status-msg' };
  handleAccountLoadError(
    new ApiError('Login required', { status: 401 }),
    unauthorizedStatus,
    unauthorizedLocation,
  );
  assert.equal(unauthorizedLocation.href, '/login.html');
  assert.equal(unauthorizedStatus.textContent, '');

  for (const error of [
    new ApiError('Service unavailable', { status: 503 }),
    new ApiError('Network request failed', { status: 0, code: 'NETWORK_ERROR' }),
    Object.assign(new Error('Not an API error'), { status: 401 }),
  ]) {
    const location = { href: '/account.html' };
    const status = { textContent: '', className: 'status-msg' };
    handleAccountLoadError(error, status, location);
    assert.equal(location.href, '/account.html');
    assert.equal(status.textContent, error.message);
    assert.equal(status.className, 'status-msg status-error');
  }
});
