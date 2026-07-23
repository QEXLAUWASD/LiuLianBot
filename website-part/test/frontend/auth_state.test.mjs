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
import { renderNavbar } from '../../public/js/nav.mjs';

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

test('createAuthState reset prevents an older in-flight result from replacing the new generation', async () => {
  const pendingLoads = [];
  let calls = 0;
  const state = createAuthState(() => {
    calls += 1;
    return new Promise(resolvePromise => pendingLoads.push(resolvePromise));
  });

  const staleLoad = state.load();
  state.reset();
  const currentLoad = state.load();
  pendingLoads[0]({ version: 'stale' });
  assert.deepEqual(await staleLoad, { version: 'stale' });
  pendingLoads[1]({ version: 'current' });
  assert.deepEqual(await currentLoad, { version: 'current' });
  assert.deepEqual(await state.load(), { version: 'current' });
  assert.equal(calls, 2);
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

test('four authenticated pages mount the shared navigation loading state', async () => {
  for (const filename of ['index.html', 'account.html', 'admin.html', 'roller.html']) {
    const html = await readFile(resolve(publicDir, filename), 'utf8');
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const originalDocument = globalThis.document;
    globalThis.document = document;
    const siteNav = document.getElementById('siteNav');
    renderNavbar(siteNav, dom.window.location);
    const navUser = document.getElementById('navUser');
    const logoutStatus = navUser.querySelector('#logoutStatus');

    assert.equal(siteNav.getAttribute('aria-label'), 'Primary');
    assert.equal(navUser.querySelector('#logoutBtn').hidden, true, `${filename} must hide inert logout`);
    assert.ok(logoutStatus, `${filename} should provide logoutStatus`);
    assert.equal(logoutStatus.getAttribute('role'), 'status');
    assert.equal(logoutStatus.getAttribute('aria-live'), 'polite');
    assert.equal(logoutStatus.textContent.trim(), 'Loading account...');
    globalThis.document = originalDocument;
    dom.window.close();
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

test('account page ships submit buttons disabled until authentication initializes', async () => {
  const html = await readFile(resolve(publicDir, 'account.html'), 'utf8');
  const document = new JSDOM(html).window.document;

  for (const formId of ['usernameForm', 'passwordForm']) {
    const button = document.querySelector(`#${formId} button[type="submit"]`);
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
  }
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

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 0));
  }
  assert.fail('Timed out waiting for the account form submission');
}

async function exerciseAccountMutation({ formId, statusId, endpoint, fill }, failure) {
  const html = await readFile(resolve(publicDir, 'account.html'), 'utf8');
  const dom = new JSDOM(html);
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const location = { href: '/account.html' };
  let mutationCalls = 0;

  globalThis.document = dom.window.document;
  globalThis.window = { location };
  globalThis.fetch = async url => {
    if (url === '/api/auth/me') {
      return new Response(JSON.stringify({
        loggedIn: true,
        user: { id: 'user-1', username: 'tester', role: 'user' },
      }), { headers: { 'content-type': 'application/json' } });
    }

    assert.equal(url, endpoint);
    mutationCalls += 1;
    if (failure.error) throw failure.error;
    return new Response(JSON.stringify({ error: failure.message }), {
      status: failure.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  authState.reset();

  try {
    const { initializeAccountPage } = await import('../../public/js/account.mjs');
    assert.equal(typeof initializeAccountPage, 'function');
    await initializeAccountPage();

    fill(dom.window.document);
    const form = dom.window.document.getElementById(formId);
    const status = dom.window.document.getElementById(statusId);
    const button = form.querySelector('button[type="submit"]');
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => mutationCalls === 1 && !button.disabled);
    assert.equal(location.href, '/account.html');
    assert.equal(status.textContent, failure.expectedMessage);
    assert.equal(status.className, 'status-msg status-error');
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-busy'), 'false');
  } finally {
    authState.reset();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
}

const accountMutationFailures = [
  {
    name: 'wrong current password',
    status: 401,
    message: 'Current password is incorrect',
    expectedMessage: 'Current password is incorrect',
  },
  {
    name: 'login required response',
    status: 401,
    message: 'Login required',
    expectedMessage: 'Login required',
  },
  {
    name: 'server failure',
    status: 503,
    message: 'Account service unavailable',
    expectedMessage: 'Account service unavailable',
  },
  {
    name: 'network failure',
    error: new TypeError('socket closed'),
    expectedMessage: 'Network request failed',
  },
];

test('username form keeps the page and reports mutation failures', async t => {
  for (const failure of accountMutationFailures) {
    await t.test(failure.name, () => exerciseAccountMutation({
      formId: 'usernameForm',
      statusId: 'usernameStatus',
      endpoint: '/api/auth/username',
      fill(document) {
        document.getElementById('newUsername').value = 'updated-name';
        document.getElementById('usernameCurrentPassword').value = 'wrong-password';
      },
    }, failure));
  }
});

test('password form keeps the page and reports mutation failures', async t => {
  for (const failure of accountMutationFailures) {
    await t.test(failure.name, () => exerciseAccountMutation({
      formId: 'passwordForm',
      statusId: 'passwordStatus',
      endpoint: '/api/auth/password',
      fill(document) {
        document.getElementById('passwordCurrentPassword').value = 'wrong-password';
        document.getElementById('newPassword').value = 'new-password';
        document.getElementById('confirmPassword').value = 'new-password';
      },
    }, failure));
  }
});

test('account forms prevent submission while authentication is pending', async () => {
  const html = await readFile(resolve(publicDir, 'account.html'), 'utf8');
  const dom = new JSDOM(html);
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let resolveAuth;
  let mutationCalls = 0;
  let initialization;

  globalThis.document = dom.window.document;
  globalThis.window = { location: { href: '/account.html' } };
  globalThis.fetch = url => {
    if (url !== '/api/auth/me') {
      mutationCalls += 1;
      return Promise.resolve(new Response('{}', {
        headers: { 'content-type': 'application/json' },
      }));
    }

    return new Promise(resolvePromise => {
      resolveAuth = () => resolvePromise(new Response(JSON.stringify({
        loggedIn: true,
        user: { id: 'user-1', username: 'tester', role: 'user' },
      }), { headers: { 'content-type': 'application/json' } }));
    });
  };
  authState.reset();

  try {
    const { initializeAccountPage } = await import('../../public/js/account.mjs');
    initialization = initializeAccountPage();

    const usernameForm = dom.window.document.getElementById('usernameForm');
    const passwordForm = dom.window.document.getElementById('passwordForm');
    const usernameButton = usernameForm.querySelector('button[type="submit"]');
    const passwordButton = passwordForm.querySelector('button[type="submit"]');
    const usernameEvent = new dom.window.Event('submit', { bubbles: true, cancelable: true });
    const passwordEvent = new dom.window.Event('submit', { bubbles: true, cancelable: true });
    usernameForm.dispatchEvent(usernameEvent);
    passwordForm.dispatchEvent(passwordEvent);

    const pendingState = {
      usernamePrevented: usernameEvent.defaultPrevented,
      passwordPrevented: passwordEvent.defaultPrevented,
      usernameDisabled: usernameButton.disabled,
      passwordDisabled: passwordButton.disabled,
      usernameBusy: usernameButton.getAttribute('aria-busy'),
      passwordBusy: passwordButton.getAttribute('aria-busy'),
      status: dom.window.document.getElementById('usernameStatus').textContent,
      mutationCalls,
    };

    resolveAuth();
    await initialization;

    assert.deepEqual(pendingState, {
      usernamePrevented: true,
      passwordPrevented: true,
      usernameDisabled: true,
      passwordDisabled: true,
      usernameBusy: 'true',
      passwordBusy: 'true',
      status: 'Loading account...',
      mutationCalls: 0,
    });
    assert.equal(usernameButton.disabled, false);
    assert.equal(passwordButton.disabled, false);
    assert.equal(usernameButton.getAttribute('aria-busy'), 'false');
    assert.equal(passwordButton.getAttribute('aria-busy'), 'false');
  } finally {
    if (resolveAuth) resolveAuth();
    if (initialization) await initialization.catch(() => {});
    authState.reset();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});

test('account authentication failures leave forms disabled and report the load error', async t => {
  for (const failure of [
    {
      name: 'server failure',
      fetch: async () => new Response(JSON.stringify({ error: 'Account service unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
      message: 'Account service unavailable',
    },
    {
      name: 'network failure',
      fetch: async () => { throw new TypeError('network unavailable'); },
      message: 'Network request failed',
    },
  ]) {
    await t.test(failure.name, async () => {
      const html = await readFile(resolve(publicDir, 'account.html'), 'utf8');
      const dom = new JSDOM(html);
      const originalDocument = globalThis.document;
      const originalWindow = globalThis.window;
      const originalFetch = globalThis.fetch;
      const location = { href: '/account.html' };
      globalThis.document = dom.window.document;
      globalThis.window = { location };
      globalThis.fetch = failure.fetch;
      authState.reset();

      try {
        const { initializeAccountPage } = await import('../../public/js/account.mjs');
        await initializeAccountPage();

        assert.equal(location.href, '/account.html');
        assert.equal(dom.window.document.getElementById('usernameStatus').textContent, failure.message);
        for (const formId of ['usernameForm', 'passwordForm']) {
          const button = dom.window.document.querySelector(`#${formId} button[type="submit"]`);
          assert.equal(button.disabled, true);
          assert.equal(button.getAttribute('aria-busy'), 'false');
        }
      } finally {
        authState.reset();
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
        globalThis.fetch = originalFetch;
        dom.window.close();
      }
    });
  }
});

async function exerciseLogoutClick({ logoutResponse, expectedLocation, expectedError }) {
  const html = await readFile(resolve(publicDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalLocation = globalThis.location;
  const originalFetch = globalThis.fetch;
  const location = { href: '/index.html' };
  let resolveLogout;

  globalThis.document = dom.window.document;
  globalThis.window = { location };
  globalThis.location = location;
  globalThis.fetch = url => {
    if (url === '/api/auth/me') {
      return Promise.resolve(new Response(JSON.stringify({
        loggedIn: true,
        user: { id: 'user-1', username: 'tester', role: 'user' },
      }), { headers: { 'content-type': 'application/json' } }));
    }
    if (url === '/api/auth/logout') {
      return new Promise(resolvePromise => {
        resolveLogout = () => resolvePromise(logoutResponse);
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  authState.reset();

  try {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 0));
    const { setupNavUser } = await import('../../public/js/app.mjs');
    assert.equal(typeof setupNavUser, 'function');
    await setupNavUser();

    const unrelatedStatus = dom.window.document.createElement('div');
    unrelatedStatus.id = 'usernameStatus';
    unrelatedStatus.setAttribute('aria-live', 'polite');
    unrelatedStatus.textContent = 'Keep this account status';
    dom.window.document.body.prepend(unrelatedStatus);

    const logoutButton = dom.window.document.getElementById('logoutBtn');
    const logoutStatus = dom.window.document.getElementById('logoutStatus');
    logoutButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const pendingState = {
      disabled: logoutButton.disabled,
      busy: logoutButton.getAttribute('aria-busy'),
    };

    resolveLogout();
    await waitFor(() => location.href === '/login.html' || !logoutButton.disabled);

    assert.deepEqual(pendingState, { disabled: true, busy: 'true' });
    assert.equal(location.href, expectedLocation);
    assert.equal(unrelatedStatus.textContent, 'Keep this account status');
    assert.equal(logoutStatus.textContent, expectedError || '');
    if (expectedError) {
      assert.equal(logoutButton.disabled, false);
      assert.equal(logoutButton.getAttribute('aria-busy'), 'false');
      assert.match(logoutStatus.className, /status-error/);
    }
  } finally {
    if (resolveLogout) resolveLogout();
    authState.reset();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.location = originalLocation;
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
}

test('logout click redirects after success and exposes a busy button while pending', () =>
  exerciseLogoutClick({
    logoutResponse: new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' },
    }),
    expectedLocation: '/login.html',
  }));

test('logout click reports failure only in logoutStatus and re-enables the button', () =>
  exerciseLogoutClick({
    logoutResponse: new Response(JSON.stringify({ error: 'Logout failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    }),
    expectedLocation: '/index.html',
    expectedError: 'Logout failed',
  }));

test('navigation auth failure removes logout controls and reports the error in logoutStatus', async () => {
  const html = await readFile(resolve(publicDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  globalThis.document = dom.window.document;
  globalThis.fetch = async () => { throw new TypeError('network unavailable'); };
  authState.reset();

  try {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 0));
    const { setupNavUser } = await import('../../public/js/app.mjs');
    assert.equal(typeof setupNavUser, 'function');
    await setupNavUser();

    assert.equal(dom.window.document.getElementById('logoutBtn').hidden, true);
    const logoutStatus = dom.window.document.getElementById('logoutStatus');
    assert.equal(logoutStatus.textContent, 'Unable to load account');
    assert.equal(logoutStatus.getAttribute('role'), 'status');
    assert.equal(logoutStatus.getAttribute('aria-live'), 'polite');
    assert.match(logoutStatus.className, /status-error/);
  } finally {
    authState.reset();
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
