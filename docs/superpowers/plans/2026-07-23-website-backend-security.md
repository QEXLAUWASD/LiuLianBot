# Website Backend Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 強化 Express session、管理群組 invariant、輸入驗證與代理行為，並將網站啟動及資料存取拆成可測試邊界，同時保持現有 URL 與 API 契約。

**Architecture:** `createApp()` 只組合 Express middleware/routes，`server.js` 負責環境驗證、資料庫初始化、HTTP/WebSocket 啟動與關閉。資料存取按領域移入 repositories，`src/db.js` 暫時作為相容 facade；route 使用共用 auth、session 與 error helpers。

**Tech Stack:** Node.js 20+、Express 4、express-session、mysql2/promise、bcryptjs、node:test、express-rate-limit

**Execution prerequisite:** 先完成 `2026-07-23-website-frontend-quality.md`，至少必須完成其 Task 5 的安全 DOM rendering，才可執行本計畫 Task 6 移除字串黑名單。這避免後端開始接受 apostrophe 等合法輸入時，舊 inline JavaScript handler 仍存在。

---

## File Map

- Create `website-part/src/app.js`: Express app factory。
- Create `website-part/src/config/session.js`: production session 設定驗證。
- Create `website-part/src/middleware/auth.js`: 共用 API/page auth middleware。
- Create `website-part/src/middleware/request_context.js`: request tracking ID。
- Create `website-part/src/middleware/error_handler.js`: domain error 到 HTTP response 映射。
- Create `website-part/src/services/session.js`: regenerate/save/revoke 流程。
- Create `website-part/src/services/group_validation.js`: create/update 共用驗證。
- Create `website-part/src/errors.js`: 穩定 error classes。
- Create `website-part/src/db/pool.js`: pool lifecycle。
- Create `website-part/src/db/migrate.js`: website schema migrations。
- Create `website-part/src/db/users.js`: user/account queries。
- Create `website-part/src/db/roles.js`: group queries 與 system-role invariant。
- Create `website-part/src/db/connections.js`: Website Access queries。
- Create `website-part/src/db/guilds.js`: read-only Discord guild queries。
- Create `website-part/src/services/roller_data.js`: R6 JSON cache。
- Modify `website-part/src/server.js`: 獨立程序入口。
- Modify `website-part/src/db.js`: 相容 facade。
- Modify `website-part/src/routes/auth.js`: session regeneration、409 race mapping。
- Modify `website-part/src/routes/account.js`: 共用 auth、撤銷其他 sessions。
- Modify `website-part/src/routes/admin.js`: group validator 與 system-role errors。
- Modify `website-part/src/routes/connections.js`: 共用 auth middleware。
- Modify `website-part/src/routes/roller.js`: 注入 cached data service。
- Modify `website-part/src/routes/connection_proxy.js`: upstream root path marker。
- Modify `website-part/src/session_store.js`: user session revocation 與 cleanup lifecycle。
- Delete `website-part/src/middleware/security.js`: 移除 SQL 字串黑名單。
- Add focused tests under `website-part/test/` for every task below。

### Task 1: Split App Construction From Process Startup

**Files:**
- Create: `website-part/src/app.js`
- Create: `website-part/src/middleware/auth.js`
- Create: `website-part/test/app_factory.test.js`
- Modify: `website-part/src/server.js:1-89`
- Modify: `website-part/src/routes/account.js:17-20`
- Modify: `website-part/src/routes/connections.js:6-9`

- [ ] **Step 1: Write a failing import test**

```javascript
// website-part/test/app_factory.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

test('importing the app factory does not listen on a port', () => {
  const appModule = require('../src/app');
  assert.equal(typeof appModule.createApp, 'function');
});

test('API auth returns 401 while page auth redirects', () => {
  const { requireApiAuth, requirePageAuth } = require('../src/middleware/auth');
  const apiRes = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  requireApiAuth({ session: {} }, apiRes, () => assert.fail('must not continue'));
  assert.equal(apiRes.statusCode, 401);

  const pageRes = { location: null, redirect(value) { this.location = value; } };
  requirePageAuth({ session: {} }, pageRes, () => assert.fail('must not continue'));
  assert.equal(pageRes.location, '/login.html');
});

test('protected HTML redirects before static files are considered', async () => {
  const express = require('express');
  const { createApp } = require('../src/app');
  const router = () => express.Router();
  const app = createApp({
    sessionOptions: {
      secret: 'test-secret', resave: false, saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, sameSite: 'strict' },
    },
    routers: {
      auth: router(), roller: router(), adminConnections: router(),
      admin: router(), connections: router(), connectionProxy: router(),
    },
  });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/account.html`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/login.html');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
```

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- --test-name-pattern="app factory|API auth"`

Expected: FAIL because `src/app.js` and shared auth middleware do not exist.

- [ ] **Step 3: Add shared auth middleware**

```javascript
// website-part/src/middleware/auth.js
function requireApiAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: 'Login required' });
}

function requirePageAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/login.html');
}

module.exports = { requireApiAuth, requirePageAuth };
```

- [ ] **Step 4: Move app assembly into a factory**

```javascript
// website-part/src/app.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const { requirePageAuth } = require('./middleware/auth');
const { requireAdmin } = require('./middleware/admin_auth');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp({ sessionOptions, routers }) {
  const app = express();
  if (sessionOptions.cookie.secure) app.set('trust proxy', 1);
  app.use(session(sessionOptions));
  app.use('/api', express.json({ limit: '16kb' }));
  app.use('/api', express.urlencoded({ extended: false, limit: '16kb' }));
  app.use('/api/auth', routers.auth);
  app.use('/api/roller', routers.roller);
  app.use('/api/admin/connections', routers.adminConnections);
  app.use('/api/admin', routers.admin);
  app.use('/api/connections', routers.connections);
  app.get('/roller.html', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'roller.html')));
  app.get('/index.html', requirePageAuth, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
  app.get('/account.html', requirePageAuth, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'account.html')));
  app.get('/admin.html', requirePageAuth, requireAdmin, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
  app.use('/connect/:slug', routers.connectionProxy);
  app.use(express.static(PUBLIC_DIR, { index: false }));
  app.get('/', (req, res) => res.redirect(req.session.user ? '/index.html' : '/login.html'));
  app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));
  return app;
}

module.exports = { createApp };
```

`server.js` must create routers, session store and HTTP server inside `startServer()`, export that function, and call it only inside `if (require.main === module)`.

- [ ] **Step 5: Replace local auth functions**

Import `requireApiAuth` in `routes/account.js` and `routes/connections.js`; delete both local copies. Preserve their existing 401 JSON behavior.

- [ ] **Step 6: Run app and existing tests**

Run: `npm test`

Expected: all tests pass, including `app_factory.test.js`.

- [ ] **Step 7: Commit the startup boundary**

```powershell
git add website-part/src/app.js website-part/src/server.js website-part/src/middleware/auth.js website-part/src/routes/account.js website-part/src/routes/connections.js website-part/test/app_factory.test.js
git commit -m "refactor: separate website app from startup"
```

### Task 2: Enforce Production Session Configuration

**Files:**
- Create: `website-part/src/config/session.js`
- Create: `website-part/test/session_config.test.js`
- Modify: `website-part/src/server.js`

- [ ] **Step 1: Write failing configuration tests**

```javascript
// website-part/test/session_config.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSessionOptions } = require('../src/config/session');

test('production requires an explicit session secret', () => {
  assert.throws(
    () => buildSessionOptions({ NODE_ENV: 'production' }, {}),
    /SESSION_SECRET/
  );
});

test('production cookies are secure and development cookies are not', () => {
  const production = buildSessionOptions(
    { NODE_ENV: 'production', SESSION_SECRET: 'test-secret' },
    {}
  );
  const development = buildSessionOptions({}, {});
  assert.equal(production.cookie.secure, true);
  assert.equal(development.cookie.secure, false);
  assert.equal(production.cookie.httpOnly, true);
  assert.equal(production.cookie.sameSite, 'strict');
});
```

- [ ] **Step 2: Verify the module is missing**

Run: `node --test test/session_config.test.js`

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement pure session option construction**

```javascript
// website-part/src/config/session.js
function buildSessionOptions(env, store) {
  const production = env.NODE_ENV === 'production';
  if (production && !env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
  }
  return {
    store,
    name: env.SESSION_COOKIE_NAME || 'connect.sid',
    secret: env.SESSION_SECRET || 'development-only-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: production,
    },
  };
}

module.exports = { buildSessionOptions };
```

Use this function in `startServer()` and pass its result into `createApp()`.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test test/session_config.test.js`

Expected: `2` tests pass.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit production session enforcement**

```powershell
git add website-part/src/config/session.js website-part/src/server.js website-part/test/session_config.test.js
git commit -m "fix: enforce secure production sessions"
```

### Task 3: Regenerate Login Sessions And Revoke Other Sessions After Password Change

**Files:**
- Create: `website-part/src/services/session.js`
- Create: `website-part/test/auth_session_lifecycle.test.js`
- Modify: `website-part/src/routes/auth.js:20-69`
- Modify: `website-part/src/routes/account.js:74-104`
- Modify: `website-part/src/session_store.js`

- [ ] **Step 1: Write failing session lifecycle tests**

```javascript
// website-part/test/auth_session_lifecycle.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { establishUserSession, revokeOtherUserSessions } = require('../src/services/session');

test('establishUserSession regenerates before saving the user', async () => {
  const order = [];
  const req = {
    session: {
      cookie: {},
      regenerate(callback) { order.push('regenerate'); callback(); },
      save(callback) { order.push('save'); callback(); },
    },
  };
  await establishUserSession(req, { id: 'u1', username: 'name' }, 1234);
  assert.deepEqual(order, ['regenerate', 'save']);
  assert.deepEqual(req.session.user, { id: 'u1', username: 'name' });
  assert.equal(req.session.cookie.maxAge, 1234);
});

test('password change revokes every other session for the user', async () => {
  const calls = [];
  const req = {
    sessionID: 'current-sid',
    sessionStore: {
      destroyUserSessions(userId, exceptSid, callback) {
        calls.push([userId, exceptSid]);
        callback();
      },
    },
  };
  await revokeOtherUserSessions(req, 'u1');
  assert.deepEqual(calls, [['u1', 'current-sid']]);
});
```

- [ ] **Step 2: Verify the session service is missing**

Run: `node --test test/auth_session_lifecycle.test.js`

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement session lifecycle helpers**

```javascript
// website-part/src/services/session.js
const callbackPromise = fn => new Promise((resolve, reject) => {
  fn(err => (err ? reject(err) : resolve()));
});

async function establishUserSession(req, user, maxAge = null) {
  await callbackPromise(callback => req.session.regenerate(callback));
  req.session.cookie.maxAge = maxAge;
  req.session.user = { id: user.id, username: user.username };
  await callbackPromise(callback => req.session.save(callback));
}

async function revokeOtherUserSessions(req, userId) {
  if (typeof req.sessionStore.destroyUserSessions !== 'function') return;
  await callbackPromise(callback => {
    req.sessionStore.destroyUserSessions(userId, req.sessionID, callback);
  });
}

module.exports = { establishUserSession, revokeOtherUserSessions };
```

- [ ] **Step 4: Add store support for revocation**

```javascript
async destroyUserSessions(userId, exceptSid, callback = () => {}) {
  try {
    const pool = await this.getPool();
    await pool.execute(
      `DELETE FROM website_sessions
       WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.user.id')) = ? AND sid <> ?`,
      [userId, exceptSid]
    );
    callback(null);
  } catch (err) {
    callback(err);
  }
}
```

Use `establishUserSession()` after successful register/login. Map `ER_DUP_ENTRY` during register to the existing 409 response. After `updatePasswordHash()`, call `revokeOtherUserSessions(req, user.id)` before returning success.

- [ ] **Step 5: Run session and route tests**

Run: `node --test test/auth_session_lifecycle.test.js test/auth_remember_me.test.js test/account_routes.test.js`

Expected: all tests pass and Remember Me still produces a 30-day cookie.

- [ ] **Step 6: Commit session lifecycle fixes**

```powershell
git add website-part/src/services/session.js website-part/src/routes/auth.js website-part/src/routes/account.js website-part/src/session_store.js website-part/test/auth_session_lifecycle.test.js
git commit -m "fix: rotate and revoke website sessions"
```

### Task 4: Add Authentication Rate Limits

**Files:**
- Modify: `website-part/package.json`
- Modify: `website-part/package-lock.json`
- Create: `website-part/src/middleware/auth_rate_limit.js`
- Create: `website-part/test/auth_rate_limit.test.js`
- Modify: `website-part/src/app.js`

- [ ] **Step 1: Add the proven limiter dependency**

Run: `npm install express-rate-limit@^7.5.0`

Expected: `package.json` and `package-lock.json` include `express-rate-limit`.

- [ ] **Step 2: Write a failing limiter configuration test**

```javascript
// website-part/test/auth_rate_limit.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { AUTH_RATE_LIMIT } = require('../src/middleware/auth_rate_limit');

test('auth limiter has a bounded window and request count', () => {
  assert.equal(AUTH_RATE_LIMIT.windowMs, 15 * 60 * 1000);
  assert.equal(AUTH_RATE_LIMIT.limit, 10);
  assert.equal(AUTH_RATE_LIMIT.standardHeaders, 'draft-7');
  assert.equal(AUTH_RATE_LIMIT.legacyHeaders, false);
});
```

- [ ] **Step 3: Implement and mount the limiter**

```javascript
// website-part/src/middleware/auth_rate_limit.js
const AUTH_RATE_LIMIT = Object.freeze({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

module.exports = { AUTH_RATE_LIMIT };
```

In `app.js`, create one limiter for `/api/auth/login` and `/api/auth/register` using `rateLimit(AUTH_RATE_LIMIT)`. Do not rate-limit `/api/auth/me`, logout or account update routes.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test test/auth_rate_limit.test.js`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit rate limiting**

```powershell
git add website-part/package.json website-part/package-lock.json website-part/src/middleware/auth_rate_limit.js website-part/src/app.js website-part/test/auth_rate_limit.test.js
git commit -m "fix: rate limit authentication attempts"
```

### Task 5: Protect The Admin System Group And Normalize Group Validation

**Files:**
- Create: `website-part/src/errors.js`
- Create: `website-part/src/services/group_validation.js`
- Create: `website-part/test/admin_group_invariants.test.js`
- Modify: `website-part/src/routes/admin.js:91-148`
- Modify: `website-part/src/db.js:386-429`

- [ ] **Step 1: Write failing validation and invariant tests**

```javascript
// website-part/test/admin_group_invariants.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGroupInput } = require('../src/services/group_validation');

test('create and update share group limits', () => {
  assert.deepEqual(
    normalizeGroupInput({ name: ' Moderators ', description: ' Staff ' }),
    { name: 'Moderators', description: 'Staff' }
  );
  assert.throws(() => normalizeGroupInput({ name: 'x'.repeat(51) }), /50/);
  assert.throws(() => normalizeGroupInput({ name: 'ok', description: 42 }), /string/);
  assert.throws(() => normalizeGroupInput({ name: 'ok', description: 'x'.repeat(256) }), /255/);
});
```

- [ ] **Step 2: Verify the validator is missing**

Run: `node --test test/admin_group_invariants.test.js`

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: Add stable errors and validation**

```javascript
// website-part/src/errors.js
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
class InputError extends AppError {
  constructor(message) { super(message, 400, 'INVALID_INPUT'); }
}
class ConflictError extends AppError {
  constructor(message) { super(message, 409, 'CONFLICT'); }
}
module.exports = { AppError, InputError, ConflictError };
```

```javascript
// website-part/src/services/group_validation.js
const { InputError } = require('../errors');

function normalizeGroupInput(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim()) {
    throw new InputError('Group name is required');
  }
  const name = input.name.trim();
  if (name.length > 50) throw new InputError('Group name must be 50 characters or less');
  if (input.description !== undefined && typeof input.description !== 'string') {
    throw new InputError('Group description must be a string');
  }
  const description = (input.description || '').trim();
  if (description.length > 255) {
    throw new InputError('Group description must be 255 characters or less');
  }
  return { name, description };
}

module.exports = { normalizeGroupInput };
```

- [ ] **Step 4: Enforce the invariant in the data layer**

Before update/delete, query the role by ID inside the same operation. If `name === 'admin'`, throw `new ConflictError('The admin group cannot be renamed or deleted')`. Keep the existing route paths, response JSON field `error`, and 409 status.

Use `normalizeGroupInput(req.body)` for both POST and PUT group routes; remove their duplicated validation branches.

- [ ] **Step 5: Run group and admin tests**

Run: `node --test test/admin_group_invariants.test.js test/admin_user_groups.test.js`

Expected: all tests pass, including self-admin membership protection.

- [ ] **Step 6: Commit group invariants**

```powershell
git add website-part/src/errors.js website-part/src/services/group_validation.js website-part/src/routes/admin.js website-part/src/db.js website-part/test/admin_group_invariants.test.js
git commit -m "fix: protect the website admin group"
```

### Task 6: Remove SQL Blacklists And Add One Error Mapper

**Files:**
- Create: `website-part/src/middleware/error_handler.js`
- Create: `website-part/src/middleware/request_context.js`
- Create: `website-part/test/input_and_error_handling.test.js`
- Modify: `website-part/src/app.js`
- Modify: `website-part/src/db.js:12-42`
- Modify: `website-part/src/routes/admin.js`
- Delete: `website-part/src/middleware/security.js`

- [ ] **Step 1: Write failing legitimate-input and error-mapping tests**

```javascript
// website-part/test/input_and_error_handling.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateString } = require('../src/db');
const { AppError } = require('../src/errors');
const { errorHandler } = require('../src/middleware/error_handler');

test('parameterized-query inputs may contain punctuation and SQL words', () => {
  assert.equal(validateString("O'Brien; SELECT", 'display'), "O'Brien; SELECT");
});

test('error handler exposes stable AppError but hides unexpected details', () => {
  const makeRes = () => ({ statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
  const expected = makeRes();
  errorHandler(new AppError('Conflict', 409, 'CONFLICT'), { requestId: 'req-1' }, expected, () => {});
  assert.deepEqual(expected.body, { error: 'Conflict', code: 'CONFLICT', request_id: 'req-1' });

  const hidden = makeRes();
  errorHandler(new Error('mysql password leaked'), { requestId: 'req-2' }, hidden, () => {});
  assert.equal(hidden.statusCode, 500);
  assert.equal(hidden.body.error, 'Internal server error');
});
```

- [ ] **Step 2: Verify current blacklist and missing mapper fail**

Run: `node --test test/input_and_error_handling.test.js`

Expected: FAIL because punctuation is rejected and `error_handler.js` is missing.

- [ ] **Step 3: Remove blacklist-only protection**

Delete `FORBIDDEN_IN_INPUT`, its check in `validateString`, the `sqlInjectionGuard` mount, and `middleware/security.js`. Keep type, empty-value and length checks. All SQL remains parameterized with `?` placeholders.

- [ ] **Step 4: Add the terminal error mapper**

```javascript
// website-part/src/middleware/request_context.js
const { randomUUID } = require('crypto');

function requestContext(req, res, next) {
  req.requestId = req.get('x-request-id') || randomUUID();
  res.set('x-request-id', req.requestId);
  next();
}

module.exports = { requestContext };
```

```javascript
// website-part/src/middleware/error_handler.js
const { AppError } = require('../errors');

function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      request_id: req.requestId,
    });
  }
  console.error(`[HTTP:${req.requestId}] Unexpected error:`, err);
  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    request_id: req.requestId,
  });
}

module.exports = { errorHandler };
```

Mount `requestContext` before all API routes. Mount `errorHandler` after API/page routes and before the HTML 404 fallback. Convert only routes touched in Tasks 3-5 to `next(err)` in this plan; keep other existing stable responses until their repository task is migrated.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test test/input_and_error_handling.test.js`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit the security simplification**

```powershell
git add website-part/src/app.js website-part/src/db.js website-part/src/routes/admin.js website-part/src/middleware/request_context.js website-part/src/middleware/error_handler.js website-part/src/middleware/security.js website-part/test/input_and_error_handling.test.js
git commit -m "refactor: replace SQL blacklist with typed validation"
```

### Task 7: Split Database Responsibilities Behind A Compatibility Facade

**Files:**
- Create: `website-part/src/db/pool.js`
- Create: `website-part/src/db/migrate.js`
- Create: `website-part/src/db/users.js`
- Create: `website-part/src/db/roles.js`
- Create: `website-part/src/db/connections.js`
- Create: `website-part/src/db/guilds.js`
- Create: `website-part/test/db_facade.test.js`
- Create: `website-part/test/website_migrations.test.js`
- Modify: `website-part/src/db.js`
- Modify: `website-part/src/server.js`

- [ ] **Step 1: Write a facade contract test before moving functions**

```javascript
// website-part/test/db_facade.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

test('db facade preserves every public function', () => {
  const db = require('../src/db');
  const names = [
    'getPool', 'findUserByUsername', 'findUserById', 'findUserCredentialsById',
    'createUser', 'updateUsername', 'updatePasswordHash', 'validateString',
    'getAllRoles', 'createRole', 'updateRole', 'deleteRole', 'getAllUsers',
    'updateUserRoles', 'deleteUser', 'getAllConnections', 'getAccessibleConnections',
    'getConnectionAccessBySlug', 'createConnection', 'updateConnection',
    'deleteConnection', 'getAllGuilds', 'getGuildDetail',
  ];
  for (const name of names) assert.equal(typeof db[name], 'function', name);
});
```

```javascript
// website-part/test/website_migrations.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { runMigrations } = require('../src/db/migrate');

test('runMigrations applies only unrecorded versions', async () => {
  const calls = [];
  const conn = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      if (sql === 'SELECT version FROM website_schema_migrations') return [[{ version: '001' }]];
      return [[]];
    },
  };
  let oldRuns = 0;
  let newRuns = 0;
  await runMigrations(conn, [
    { version: '001', name: 'old', up: async () => { oldRuns += 1; } },
    { version: '002', name: 'new', up: async () => { newRuns += 1; } },
  ]);
  assert.equal(oldRuns, 0);
  assert.equal(newRuns, 1);
  assert.ok(calls.some(([sql, params]) =>
    sql.startsWith('INSERT INTO website_schema_migrations') && params[0] === '002'
  ));
});
```

- [ ] **Step 2: Run the contract against the current monolith**

Run: `node --test test/db_facade.test.js`

Expected: PASS; this captures the compatibility surface before moving code.

- [ ] **Step 3: Move pool creation and migrations**

`db/pool.js` owns `loadConfig`, `pool`, `poolInitialization`, `getPool`, and a test-only `closePool()`. `getPool()` calls `runMigrations(conn)` once inside the cached initialization promise and resets state after failure exactly as current `db.js` does.

`db/migrate.js` defines versioned migrations and this runner:

```javascript
async function runMigrations(conn, migrations = MIGRATIONS) {
  await conn.execute(
    `CREATE TABLE IF NOT EXISTS website_schema_migrations (
       version VARCHAR(32) PRIMARY KEY,
       name VARCHAR(255) NOT NULL,
       applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  const [rows] = await conn.execute('SELECT version FROM website_schema_migrations');
  const applied = new Set(rows.map(row => String(row.version)));
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    await migration.up(conn);
    await conn.execute(
      'INSERT INTO website_schema_migrations (version, name) VALUES (?, ?)',
      [migration.version, migration.name]
    );
  }
}

module.exports = { runMigrations, MIGRATIONS };
```

Move the existing ordered schema statements into `MIGRATIONS` as `001` baseline roles/users, `002` user-role memberships/sessions, and `003` connections/hidden column. Each `up(conn)` uses `CREATE TABLE IF NOT EXISTS` and explicitly ignores only the expected duplicate-column error code.

Export this interface:

```javascript
module.exports = { getPool, closePool, validateString, validateInt };
```

- [ ] **Step 4: Move domain queries without changing signatures**

- `db/users.js`: auth/account/user-management functions.
- `db/roles.js`: group functions and protected-admin invariant.
- `db/connections.js`: connection access and CRUD functions.
- `db/guilds.js`: `getAllGuilds` and `getGuildDetail`.

Each module imports `getPool`, `validateString` and `validateInt` from `./pool`. Preserve SQL placeholders, return shapes and transaction boundaries. Do not rename exported functions in this task.

- [ ] **Step 5: Replace `src/db.js` with the compatibility facade**

```javascript
// website-part/src/db.js
module.exports = {
  ...require('./db/pool'),
  ...require('./db/users'),
  ...require('./db/roles'),
  ...require('./db/connections'),
  ...require('./db/guilds'),
};
```

Call `await getPool()` in `startServer()` before creating the listening server so migration failure prevents startup.

- [ ] **Step 6: Run every backend contract test**

Run: `node --test test/db_facade.test.js test/website_migrations.test.js`

Expected: facade and migration version tests pass.

Run: `npm test`

Expected: all tests pass with no route import changes required.

- [ ] **Step 7: Check syntax for every backend module**

Run: `Get-ChildItem src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`

Expected: exit code 0.

- [ ] **Step 8: Commit repository boundaries**

```powershell
git add website-part/src/db.js website-part/src/db website-part/src/server.js website-part/test/db_facade.test.js website-part/test/website_migrations.test.js
git commit -m "refactor: split website database repositories"
```

### Task 8: Cache Roller Data And Clean Expired Sessions

**Files:**
- Create: `website-part/src/services/roller_data.js`
- Create: `website-part/test/roller_data.test.js`
- Create: `website-part/test/session_cleanup.test.js`
- Modify: `website-part/src/routes/roller.js`
- Modify: `website-part/src/session_store.js`
- Modify: `website-part/src/server.js`

- [ ] **Step 1: Write failing cache and cleanup tests**

```javascript
// website-part/test/roller_data.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRollerData } = require('../src/services/roller_data');

test('roller data reads each JSON file once until reload', () => {
  let reads = 0;
  const data = createRollerData({
    readJson() { reads += 1; return { value: reads }; },
    operatorPath: 'operators',
    mapPath: 'maps',
  });
  assert.equal(data.operators().value, 1);
  assert.equal(data.operators().value, 1);
  assert.equal(data.maps().value, 2);
  data.reload();
  assert.equal(data.operators().value, 3);
});
```

```javascript
// website-part/test/session_cleanup.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { MySqlSessionStore } = require('../src/session_store');

test('cleanupExpired deletes all expired sessions', async () => {
  const calls = [];
  const pool = { execute: async (sql, params) => calls.push([sql, params]) };
  const store = new MySqlSessionStore({ getPool: async () => pool });
  await store.cleanupExpired(12345);
  assert.match(calls[0][0], /DELETE FROM website_sessions/);
  assert.deepEqual(calls[0][1], [12345]);
});
```

- [ ] **Step 2: Verify both capabilities are missing**

Run: `node --test test/roller_data.test.js test/session_cleanup.test.js`

Expected: FAIL because neither API exists.

- [ ] **Step 3: Implement the cache**

```javascript
// website-part/src/services/roller_data.js
const fs = require('fs');

function defaultReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createRollerData({ readJson = defaultReadJson, operatorPath, mapPath }) {
  let operatorCache;
  let mapCache;
  return {
    operators() { return operatorCache ??= readJson(operatorPath); },
    maps() { return mapCache ??= readJson(mapPath); },
    reload() { operatorCache = undefined; mapCache = undefined; },
  };
}

module.exports = { createRollerData };
```

Create one service instance when the roller router is constructed. Replace all request-time `loadJSON()` calls with `rollerData.operators()` or `rollerData.maps()`.

- [ ] **Step 4: Add session cleanup lifecycle**

Add methods to `MySqlSessionStore`:

```javascript
async cleanupExpired(now = Date.now()) {
  const pool = await this.getPool();
  await pool.execute('DELETE FROM website_sessions WHERE expires_at <= ?', [now]);
}

startCleanup(intervalMs = 60 * 60 * 1000) {
  if (this.cleanupTimer) return;
  this.cleanupTimer = setInterval(() => {
    this.cleanupExpired().catch(err => this.emit('disconnect', err));
  }, intervalMs);
  this.cleanupTimer.unref?.();
}

stopCleanup() {
  if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  this.cleanupTimer = null;
}
```

Start cleanup after database initialization. Stop it during server close/error cleanup.

- [ ] **Step 5: Run cache, cleanup and full tests**

Run: `node --test test/roller_data.test.js test/session_cleanup.test.js`

Expected: all focused tests pass.

Run: `npm test`

Expected: all website tests pass.

- [ ] **Step 6: Commit cache and cleanup lifecycle**

```powershell
git add website-part/src/services/roller_data.js website-part/src/routes/roller.js website-part/src/session_store.js website-part/src/server.js website-part/test/roller_data.test.js website-part/test/session_cleanup.test.js
git commit -m "perf: cache roller data and clean sessions"
```

### Task 9: Preserve Root-Relative Upstream Redirects

**Files:**
- Modify: `website-part/src/proxy_helpers.js`
- Modify: `website-part/src/routes/connection_proxy.js`
- Modify: `website-part/test/proxy_helpers.test.js`
- Modify: `website-part/test/websocket_proxy.test.js`

- [ ] **Step 1: Add a failing root-relative redirect test**

```javascript
test('marks redirects outside the configured target base path', () => {
  assert.equal(
    rewriteLocation('/login', 'https://example.test/app/', 'reports'),
    '/connect/reports/__upstream_root__/login'
  );
});
```

- [ ] **Step 2: Verify the current rewrite fails**

Run: `node --test test/proxy_helpers.test.js`

Expected: FAIL; current output is `/connect/reports/login`.

- [ ] **Step 3: Encode and decode upstream-root paths**

In `rewriteLocation`, when the same-origin redirect path is outside `target.pathname`, return:

```javascript
return `/connect/${slug}/__upstream_root__${redirected.pathname}${redirected.search}${redirected.hash}`;
```

Before proxying HTTP or WebSocket requests, detect the marker:

```javascript
function applyUpstreamRootPath(req) {
  const marker = '/__upstream_root__';
  if (req.url !== marker && !req.url.startsWith(`${marker}/`)) return;
  const target = new URL(req.connectionTarget.target_url);
  req.connectionTarget = { ...req.connectionTarget, target_url: target.origin };
  req.url = req.url.slice(marker.length) || '/';
}
```

Call it after access authorization and before `proxy`/`proxy.upgrade`. Keep the configured connection object immutable by assigning a copy.

- [ ] **Step 4: Run HTTP and WebSocket proxy tests**

Run: `node --test test/proxy_helpers.test.js test/websocket_proxy.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit proxy path preservation**

```powershell
git add website-part/src/proxy_helpers.js website-part/src/routes/connection_proxy.js website-part/test/proxy_helpers.test.js website-part/test/websocket_proxy.test.js
git commit -m "fix: preserve upstream root redirects"
```

### Task 10: Validate The Website Backend End To End

**Files:**
- Modify only if validation exposes a defect in Tasks 1-9.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all existing and new tests pass.

- [ ] **Step 2: Parse all owned JavaScript**

Run: `Get-ChildItem src,test -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`

Expected: exit code 0.

- [ ] **Step 3: Smoke-test the app factory without listening**

Run: `node -e "const { createApp } = require('./src/app'); console.log(typeof createApp)"`

Expected: prints `function` and exits without opening a port.

- [ ] **Step 4: Verify no fallback production secret or SQL blacklist remains**

Run: `rg -n "liulianbot-secret-key-change-in-production|SQLI_PATTERNS|FORBIDDEN_IN_INPUT" src`

Expected: no matches. Treat ripgrep exit code 1 as successful zero-match output.

- [ ] **Step 5: Check the final diff**

Run: `git diff --check`

Expected: exit code 0.
