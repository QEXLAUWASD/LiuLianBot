# Website Frontend Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以原生 ES modules 統一前端 API、auth state、tabs、dialog 與 DOM rendering，修正登出錯誤、非 2xx 處理、inline handler 風險及主要可及性問題，而不重新設計網站視覺。

**Architecture:** 可獨立測試的 `.mjs` 模組承擔共用行為；頁面 entry modules 只負責組合功能。動態資料使用 DOM API，不使用 inline JavaScript context；ARIA、焦點與鍵盤狀態由 tabs/dialog modules 管理。

**Tech Stack:** Browser ES modules、DOM APIs、Fetch API、Node.js `node:test`、jsdom、現有 HTML/CSS

---

## File Map

- Create `website-part/public/js/api_client.mjs`: 統一 HTTP/JSON/error handling。
- Create `website-part/public/js/auth_state.mjs`: 單次載入目前 user。
- Create `website-part/public/js/tabs.mjs`: ARIA tab keyboard model。
- Create `website-part/public/js/dialog.mjs`: modal focus lifecycle。
- Create `website-part/public/js/dom.mjs`: 安全 DOM 建構工具。
- Create `website-part/public/js/form_state.mjs`: mutation busy-state guard。
- Create `website-part/public/js/nav.mjs`: 共用 navbar。
- Rename page scripts from `.js` to `.mjs` as each page is migrated。
- Modify all HTML files to use `type="module"` and correct language/ARIA markup。
- Modify `website-part/public/css/style.css`: 合併 tabs、dialog state、live region 與 reduced motion。
- Add frontend tests under `website-part/test/frontend/`。

### Task 1: Add DOM Test Support And A Shared API Client

**Files:**
- Modify: `website-part/package.json`
- Modify: `website-part/package-lock.json`
- Create: `website-part/public/js/api_client.mjs`
- Create: `website-part/test/frontend/api_client.test.mjs`

- [ ] **Step 1: Install jsdom as a development dependency**

Run: `npm install --save-dev jsdom@^26.1.0`

Expected: `package.json` contains `devDependencies.jsdom` and the lockfile is updated.

- [ ] **Step 2: Write failing API client tests**

```javascript
// website-part/test/frontend/api_client.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, requestJSON } from '../../public/js/api_client.mjs';

const response = ({ status = 200, body = {}, contentType = 'application/json' }) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
  async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
});

test('requestJSON returns parsed JSON for a successful response', async () => {
  const value = await requestJSON('/ok', {}, async () => response({ body: { ok: true } }));
  assert.deepEqual(value, { ok: true });
});

test('requestJSON preserves HTTP status and server error text', async () => {
  await assert.rejects(
    requestJSON('/bad', {}, async () => response({ status: 500, body: { error: 'Unavailable' } })),
    error => error instanceof ApiError && error.status === 500 && error.message === 'Unavailable'
  );
});

test('requestJSON handles non-JSON and network failures', async () => {
  await assert.rejects(
    requestJSON('/html', {}, async () => response({ status: 502, body: '<html>', contentType: 'text/html' })),
    error => error instanceof ApiError && error.status === 502
  );
  await assert.rejects(
    requestJSON('/offline', {}, async () => { throw new TypeError('offline'); }),
    error => error instanceof ApiError && error.status === 0
  );
});
```

- [ ] **Step 3: Verify the module is missing**

Run: `node --test test/frontend/api_client.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement the API client**

```javascript
// website-part/public/js/api_client.mjs
export class ApiError extends Error {
  constructor(message, status = 0, code = 'NETWORK_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function requestJSON(url, options = {}, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw new ApiError('Unable to reach the server', 0, 'NETWORK_ERROR');
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = null; }
  }

  if (!response.ok) {
    throw new ApiError(
      body?.error || `Request failed with status ${response.status}`,
      response.status,
      body?.code || 'HTTP_ERROR'
    );
  }
  return body;
}
```

- [ ] **Step 5: Run the API client tests**

Run: `node --test test/frontend/api_client.test.mjs`

Expected: `3` tests pass.

- [ ] **Step 6: Commit the API foundation**

```powershell
git add website-part/package.json website-part/package-lock.json website-part/public/js/api_client.mjs website-part/test/frontend/api_client.test.mjs
git commit -m "test: add frontend API client foundation"
```

### Task 2: Share Auth State And Make Logout Truthful

**Files:**
- Create: `website-part/public/js/auth_state.mjs`
- Create: `website-part/test/frontend/auth_state.test.mjs`
- Rename: `website-part/public/js/app.js` to `website-part/public/js/app.mjs`
- Rename: `website-part/public/js/account.js` to `website-part/public/js/account.mjs`
- Modify: `website-part/public/index.html`
- Modify: `website-part/public/account.html`
- Modify: `website-part/public/admin.html`
- Modify: `website-part/public/roller.html`

- [ ] **Step 1: Write failing cache and logout tests**

```javascript
// website-part/test/frontend/auth_state.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthState, logout } from '../../public/js/auth_state.mjs';

test('auth state shares one in-flight me request', async () => {
  let calls = 0;
  const state = createAuthState(async () => {
    calls += 1;
    return { loggedIn: true, user: { id: 'u1' } };
  });
  const [first, second] = await Promise.all([state.load(), state.load()]);
  assert.equal(calls, 1);
  assert.equal(first.user.id, 'u1');
  assert.equal(second.user.id, 'u1');
});

test('logout redirects only after the server confirms success', async () => {
  const location = { href: '/account.html' };
  await assert.rejects(logout(async () => { throw new Error('failed'); }, location));
  assert.equal(location.href, '/account.html');
  await logout(async () => ({ success: true }), location);
  assert.equal(location.href, '/login.html');
});
```

- [ ] **Step 2: Verify the module is missing**

Run: `node --test test/frontend/auth_state.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement shared auth state**

```javascript
// website-part/public/js/auth_state.mjs
import { requestJSON } from './api_client.mjs';

export function createAuthState(loader = () => requestJSON('/api/auth/me')) {
  let pending;
  return {
    load() {
      if (!pending) {
        pending = loader().catch(error => {
          pending = undefined;
          throw error;
        });
      }
      return pending;
    },
    reset() { pending = undefined; },
  };
}

export async function logout(request = requestJSON, location = window.location) {
  await request('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
}

export const authState = createAuthState();
```

- [ ] **Step 4: Migrate app and account entries**

Rename both scripts to `.mjs`, import `authState`, `logout`, `requestJSON` and `ApiError`, and remove their duplicate `/api/auth/me` calls. `account.mjs` must redirect only for `ApiError.status === 401`; network/5xx errors render into the existing `aria-live` status element.

Replace every page's app script tag with:

```html
<script type="module" src="/js/app.mjs"></script>
```

Account additionally loads `/js/account.mjs` as a module.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test test/frontend/auth_state.test.mjs`

Expected: `2` tests pass.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit truthful auth state**

```powershell
git add website-part/public/js/app.js website-part/public/js/app.mjs website-part/public/js/account.js website-part/public/js/account.mjs website-part/public/js/auth_state.mjs website-part/public/*.html website-part/test/frontend/auth_state.test.mjs
git commit -m "fix: share auth state and verify logout"
```

### Task 3: Introduce An Accessible Tab Component

**Files:**
- Create: `website-part/public/js/tabs.mjs`
- Create: `website-part/test/frontend/tabs.test.mjs`
- Rename: `website-part/public/js/auth.js` to `website-part/public/js/auth.mjs`
- Rename: `website-part/public/js/roller.js` to `website-part/public/js/roller.mjs`
- Modify: `website-part/public/login.html:14-72`
- Modify: `website-part/public/roller.html:27-117`
- Modify: `website-part/public/admin.html:27-106`

- [ ] **Step 1: Write failing ARIA and keyboard tests**

```javascript
// website-part/test/frontend/tabs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setupTabs } from '../../public/js/tabs.mjs';

test('tabs synchronize ARIA, panels and ArrowRight focus', () => {
  const dom = new JSDOM(`
    <div data-tabs>
      <div role="tablist"><button role="tab" id="a" aria-controls="pa">A</button><button role="tab" id="b" aria-controls="pb">B</button></div>
      <section role="tabpanel" id="pa"></section><section role="tabpanel" id="pb"></section>
    </div>`);
  const root = dom.window.document.querySelector('[data-tabs]');
  setupTabs(root);
  const [a, b] = root.querySelectorAll('[role="tab"]');
  assert.equal(a.getAttribute('aria-selected'), 'true');
  assert.equal(root.querySelector('#pb').hidden, true);
  a.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(dom.window.document.activeElement, b);
  assert.equal(b.getAttribute('aria-selected'), 'true');
});
```

- [ ] **Step 2: Verify the component is missing**

Run: `node --test test/frontend/tabs.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the tab keyboard model**

```javascript
// website-part/public/js/tabs.mjs
export function setupTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = selected => {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      root.querySelector(`#${tab.getAttribute('aria-controls')}`).hidden = !active;
    }
    selected.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!offset) return;
      event.preventDefault();
      select(tabs[(index + offset + tabs.length) % tabs.length]);
    });
  });
  select(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0]);
  return { select };
}
```

- [ ] **Step 4: Update page semantics and entries**

For login, roller and admin:

- Wrap tabs in a container with `data-tabs`.
- Add `role="tablist"` to the button group.
- Give each button `role="tab"`, stable `id`, `aria-controls`, and one initial `aria-selected="true"`.
- Give panels `role="tabpanel"`, `aria-labelledby`, and `hidden` on inactive panels.
- Import `setupTabs` from each page entry and initialize every `[data-tabs]` root.
- Rename auth/roller entries to `.mjs` and update script tags to `type="module"`.

- [ ] **Step 5: Run tab and full tests**

Run: `node --test test/frontend/tabs.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit accessible tabs**

```powershell
git add website-part/public/js/tabs.mjs website-part/public/js/auth.js website-part/public/js/auth.mjs website-part/public/js/roller.js website-part/public/js/roller.mjs website-part/public/login.html website-part/public/roller.html website-part/public/admin.html website-part/test/frontend/tabs.test.mjs
git commit -m "feat: add accessible keyboard tabs"
```

### Task 4: Introduce Accessible Dialog Focus Management

**Files:**
- Create: `website-part/public/js/dialog.mjs`
- Create: `website-part/test/frontend/dialog.test.mjs`
- Modify: `website-part/public/admin.html:120-253`
- Modify: `website-part/public/css/style.css`

- [ ] **Step 1: Write failing dialog lifecycle tests**

```javascript
// website-part/test/frontend/dialog.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDialog } from '../../public/js/dialog.mjs';

test('dialog opens, closes on Escape and restores focus', () => {
  const dom = new JSDOM('<button id="open">Open</button><div id="dialog" hidden><button id="close">Close</button></div>');
  const { document, KeyboardEvent } = dom.window;
  const opener = document.querySelector('#open');
  opener.focus();
  const dialog = createDialog(document.querySelector('#dialog'));
  dialog.open();
  assert.equal(document.querySelector('#dialog').hidden, false);
  assert.equal(document.activeElement.id, 'close');
  document.querySelector('#dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('#dialog').hidden, true);
  assert.equal(document.activeElement, opener);
});
```

- [ ] **Step 2: Verify the dialog module is missing**

Run: `node --test test/frontend/dialog.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement focus, Escape and restore behavior**

```javascript
// website-part/public/js/dialog.mjs
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createDialog(element) {
  let opener = null;
  const ownerDocument = element.ownerDocument;
  const focusables = () => [...element.querySelectorAll(FOCUSABLE)];
  const close = () => {
    element.hidden = true;
    opener?.focus();
  };
  element.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && ownerDocument.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && ownerDocument.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  return {
    open(source = ownerDocument.activeElement) {
      opener = source;
      element.hidden = false;
      focusables()[0]?.focus();
    },
    close,
  };
}
```

- [ ] **Step 4: Add dialog semantics to every admin modal**

Each modal container gets `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to its heading, and the native `hidden` attribute. Close buttons use `data-dialog-close`; remove inline `onclick`. Add CSS `[role="dialog"][hidden] { display: none; }` without changing the existing visual dimensions.

- [ ] **Step 5: Run dialog tests**

Run: `node --test test/frontend/dialog.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit accessible dialogs**

```powershell
git add website-part/public/js/dialog.mjs website-part/public/admin.html website-part/public/css/style.css website-part/test/frontend/dialog.test.mjs
git commit -m "feat: add accessible admin dialogs"
```

### Task 5: Replace Inline Handlers And Unsafe Dynamic Markup

**Files:**
- Create: `website-part/public/js/dom.mjs`
- Create: `website-part/test/frontend/dom_rendering.test.mjs`
- Rename: `website-part/public/js/admin.js` to `website-part/public/js/admin.mjs`
- Modify: `website-part/public/js/roller.mjs`
- Modify: `website-part/public/admin.html`
- Modify: `website-part/public/roller.html`

- [ ] **Step 1: Write a failing hostile-value rendering test**

```javascript
// website-part/test/frontend/dom_rendering.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { element } from '../../public/js/dom.mjs';

test('dynamic values remain text and never become event handlers', () => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.document = dom.window.document;
  const hostile = `x');alert(1)//<img src=x onerror=alert(2)>`;
  const button = element('button', { text: hostile, dataset: { action: 'edit-user', id: hostile } });
  document.querySelector('#root').append(button);
  assert.equal(button.textContent, hostile);
  assert.equal(button.hasAttribute('onclick'), false);
  assert.equal(document.querySelector('img'), null);
  delete globalThis.document;
});
```

- [ ] **Step 2: Verify the DOM module is missing**

Run: `node --test test/frontend/dom_rendering.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement a small safe DOM helper**

```javascript
// website-part/public/js/dom.mjs
export function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type) node.type = options.type;
  for (const [key, value] of Object.entries(options.dataset || {})) node.dataset[key] = String(value);
  for (const [key, value] of Object.entries(options.attributes || {})) node.setAttribute(key, String(value));
  node.append(...children.filter(Boolean));
  return node;
}

export function replaceChildren(target, children) {
  target.replaceChildren(...children.filter(Boolean));
}
```

- [ ] **Step 4: Migrate admin rendering and actions**

Rename `admin.js` to `admin.mjs`. Import `requestJSON`, `element`, `replaceChildren`, `setupTabs` and `createDialog`. Replace every template-generated `onclick` with buttons containing `data-action` and IDs. Add one delegated click handler on the admin root:

```javascript
adminRoot.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const actions = {
    'edit-user': () => openUserEdit(control.dataset.id),
    'delete-user': () => confirmDeleteUser(control.dataset.id),
    'edit-group': () => openGroupEdit(Number(control.dataset.id)),
    'delete-group': () => confirmDeleteGroup(Number(control.dataset.id)),
    'guild-detail': () => openGuildDetail(control.dataset.id),
    'edit-connection': () => openConnectionEdit(Number(control.dataset.id)),
    'delete-connection': () => confirmDeleteConnection(Number(control.dataset.id)),
  };
  actions[control.dataset.action]?.();
});
```

Build user/group/guild/connection rows with `element()` and `textContent`. Do not preserve `escapeHTML`; delete both duplicate global implementations after all callers are migrated.

- [ ] **Step 5: Migrate roller result rendering**

Replace operator/map/history `innerHTML` templates with DOM nodes. Image load fallback uses `image.addEventListener('error', ...)`, not inline `onerror`. Error/result containers receive `role="status"` or `aria-live="polite"` as appropriate.

- [ ] **Step 6: Run DOM and full tests**

Run: `node --test test/frontend/dom_rendering.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Verify inline handlers are gone**

Run: `rg -n "onclick=|onerror=|onchange=" public`

Expected: no matches; ripgrep exit code 1 means the zero-match check succeeded.

- [ ] **Step 8: Commit safe rendering**

```powershell
git add website-part/public/js/admin.js website-part/public/js/admin.mjs website-part/public/js/roller.mjs website-part/public/js/dom.mjs website-part/public/admin.html website-part/public/roller.html website-part/test/frontend/dom_rendering.test.mjs
git commit -m "refactor: remove inline frontend handlers"
```

### Task 6: Normalize API Loading And Mutation States

**Files:**
- Create: `website-part/public/js/form_state.mjs`
- Create: `website-part/test/frontend/admin_api_states.test.mjs`
- Modify: `website-part/public/js/admin.mjs`
- Modify: `website-part/public/js/auth.mjs`
- Modify: `website-part/public/js/account.mjs`

- [ ] **Step 1: Write a failing reusable busy-state test**

```javascript
// website-part/test/frontend/admin_api_states.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { withBusyControl } from '../../public/js/form_state.mjs';

test('withBusyControl disables and restores a mutation control', async () => {
  const button = { disabled: false };
  let disabledDuringRequest = false;
  await withBusyControl(button, async () => {
    disabledDuringRequest = button.disabled;
  });
  assert.equal(disabledDuringRequest, true);
  assert.equal(button.disabled, false);
});
```

- [ ] **Step 2: Verify the helper is missing**

Run: `node --test test/frontend/admin_api_states.test.mjs`

Expected: FAIL because `form_state.mjs` does not exist.

- [ ] **Step 3: Add one mutation guard and one list loader pattern**

```javascript
// website-part/public/js/form_state.mjs
export async function withBusyControl(control, operation) {
  if (control.disabled) return;
  control.disabled = true;
  try { return await operation(); } finally { control.disabled = false; }
}
```

Import `withBusyControl` into `admin.mjs`, `auth.mjs` and `account.mjs`. Every admin mutation, login/register submit and account submit uses this helper. Every admin list loader uses `requestJSON`; 401/403 redirect or show access denial, 5xx/network errors render an error row, and only successful empty arrays render `No ... found`.

- [ ] **Step 4: Run state and full tests**

Run: `node --test test/frontend/admin_api_states.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit consistent API states**

```powershell
git add website-part/public/js/form_state.mjs website-part/public/js/admin.mjs website-part/public/js/auth.mjs website-part/public/js/account.mjs website-part/test/frontend/admin_api_states.test.mjs
git commit -m "fix: normalize frontend request states"
```

### Task 7: Share The Navbar And Correct Document Language

**Files:**
- Create: `website-part/public/js/nav.mjs`
- Create: `website-part/test/frontend/nav.test.mjs`
- Modify: `website-part/public/index.html`
- Modify: `website-part/public/account.html`
- Modify: `website-part/public/roller.html`
- Modify: `website-part/public/admin.html`
- Modify: `website-part/public/login.html`
- Modify: `website-part/public/404.html`
- Modify: `website-part/public/js/app.mjs`

- [ ] **Step 1: Write a failing navbar structure test**

```javascript
// website-part/test/frontend/nav.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderNavbar } from '../../public/js/nav.mjs';

test('navbar renders stable navigation and admin visibility hook', () => {
  const dom = new JSDOM('<nav id="siteNav"></nav>');
  globalThis.document = dom.window.document;
  renderNavbar(document.querySelector('#siteNav'));
  assert.equal(document.querySelector('a[href="/index.html"]').textContent, 'Home');
  assert.ok(document.querySelector('[data-admin-only]'));
  assert.ok(document.querySelector('[data-logout]'));
  delete globalThis.document;
});
```

- [ ] **Step 2: Verify the navbar module is missing**

Run: `node --test test/frontend/nav.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the shared navbar**

Use `element()` to construct the existing brand, Home, Roller, Account, Admin, Website Access dropdown, current-user region and logout control. Preserve existing classes so visual styling does not change. Export `renderNavbar(target)` and return references to the user, admin-only, dropdown and logout elements for `app.mjs` initialization.

- [ ] **Step 4: Replace duplicated markup**

In index/account/roller/admin, replace the repeated navbar body with `<nav id="siteNav" class="navbar" aria-label="Primary"></nav>`. `app.mjs` calls `renderNavbar()` before wiring auth state and logout.

Set `lang="en"` on all six documents because current interface content is English. This is not a translation redesign.

- [ ] **Step 5: Run navbar and full tests**

Run: `node --test test/frontend/nav.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit shared navigation**

```powershell
git add website-part/public/js/nav.mjs website-part/public/js/app.mjs website-part/public/*.html website-part/test/frontend/nav.test.mjs
git commit -m "refactor: share website navigation markup"
```

### Task 8: Consolidate Component CSS And Live Regions

**Files:**
- Modify: `website-part/public/css/style.css`
- Modify: `website-part/public/login.html`
- Modify: `website-part/public/roller.html`
- Modify: `website-part/public/admin.html`

- [ ] **Step 1: Replace three tab style families with shared classes**

Use `.tabs`, `.tab-list`, `.tab`, and `.tab-panel` for login, roller and admin. Preserve current spacing and colors by moving shared declarations from `.auth-tabs`, `.roller-tabs`, and `.admin-tabs`; keep only genuinely page-specific layout rules.

- [ ] **Step 2: Add live-region semantics**

- Login/register error containers: `role="alert"`, `aria-live="assertive"`.
- Roller results: `role="status"`, `aria-live="polite"`.
- Toast container: `role="status"`, `aria-live="polite"`, `aria-atomic="true"`.
- Admin load errors: `role="alert"` on generated error content.

- [ ] **Step 3: Add reduced-motion behavior**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

Replace `transition: all` with explicit properties in rules touched by this task. Remove `.form-select` only after `rg -n "form-select" public` confirms the selector has no HTML/JS consumer.

- [ ] **Step 4: Run all frontend and backend tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Parse all browser modules**

Run: `Get-ChildItem public\js -Recurse -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName }`

Expected: exit code 0.

- [ ] **Step 6: Commit shared component styles**

```powershell
git add website-part/public/css/style.css website-part/public/login.html website-part/public/roller.html website-part/public/admin.html
git commit -m "feat: improve frontend accessibility states"
```

### Task 9: Verify The Frontend In Browser-Sized Viewports

**Files:**
- Modify only if visual verification exposes a defect in Tasks 1-8.

- [ ] **Step 1: Start the website with a test-safe local configuration**

Run: `npm run dev`

Expected: server starts on an available local port and protected pages redirect consistently.

- [ ] **Step 2: Verify desktop workflows at 1440x900**

Check login/register tabs, logout failure handling, navbar dropdown, all admin tabs, every dialog, roller results and account forms. Confirm no text overlap, no horizontal overflow, and no dynamic layout shift from loading/error states.

- [ ] **Step 3: Verify mobile workflows at 390x844**

Repeat the same workflows. Confirm tables remain usable through the existing responsive treatment, dialog controls remain inside the viewport, and long usernames/descriptions wrap without covering actions.

- [ ] **Step 4: Verify keyboard-only behavior**

Use Tab/Shift+Tab, ArrowLeft/ArrowRight and Escape. Confirm focus visibility, dialog trapping/restoration, tab selection and every management action are reachable without a pointer.

- [ ] **Step 5: Run final automated validation**

Run: `npm test`

Expected: all tests pass.

Run: `git diff --check`

Expected: exit code 0.
