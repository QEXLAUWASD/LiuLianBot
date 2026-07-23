# Project Quality And Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成跨 Python/Node 的設定整合、剩餘效能改善、deprecated shim 清理、文件範例與 Windows/Linux CI，並以完整回歸驗證關閉全專案最佳化工作。

**Architecture:** `core.config` 是 Discord 設定的唯一讀寫邊界；R6 JSON cache 具有明確 reload；網站 repositories 以批次與平行查詢降低重複 I/O；CI 只依賴 mock/unit tests，不要求外部 Discord 或 MySQL 服務。

**Tech Stack:** Python 3.11、Node.js 20、Pytest、Ruff、node:test、GitHub Actions、MySQL/MariaDB optional integration validation

---

## File Map

- Modify `discord-part/core/config.py`: 原子更新與 cache invalidation。
- Modify all Discord config consumers: 使用集中 API。
- Create `discord-part/features/r6_roll/data_cache.py`: Python R6 cache。
- Create `discord-part/utils/async_io.py`: sync repository 的受控 thread executor 邊界。
- Modify `randommap.py`, `randomops.py`, `r6_update.py`: cache read/reload。
- Modify website repositories created by the backend plan: parallel reads、Map merge、batch inserts。
- Remove deprecated logger compatibility shims after all references migrate。
- Create `website-part/.env.example` and `shared/database/config.example.json`。
- Modify project READMEs and shared database documentation。
- Create `website-part/tools/check-js.js` and package quality scripts。
- Create `.github/workflows/ci.yml` for Windows/Linux validation。

### Task 1: Make `core.config` The Only Discord Config Writer

**Files:**
- Create: `discord-part/tests/test_config.py`
- Modify: `discord-part/core/config.py`
- Modify: `discord-part/commands/language_manager.py`
- Modify: `discord-part/commands/owner/add_admin.py`
- Modify: `discord-part/commands/owner/remove_admin.py`
- Modify: `discord-part/commands/guild_owner/add_guild_admin.py`
- Modify: `discord-part/commands/guild_owner/remove_guild_admin.py`
- Modify: `discord-part/commands/user/get_lang.py`

- [ ] **Step 1: Write failing atomic-update and cache tests**

```python
# discord-part/tests/test_config.py
import json

import core.config as config_module


def test_update_config_writes_atomically_and_refreshes_cache(monkeypatch, tmp_path):
    path = tmp_path / "config.json"
    path.write_text('{"bot_admin": []}', encoding="utf-8")
    monkeypatch.setattr(config_module, "CONFIG_PATH", str(path))
    config_module._config = {}

    updated = config_module.update_config(
        lambda config: config["bot_admin"].append("123")
    )

    assert updated["bot_admin"] == ["123"]
    assert config_module.get_config()["bot_admin"] == ["123"]
    assert json.loads(path.read_text(encoding="utf-8"))["bot_admin"] == ["123"]
    assert not list(tmp_path.glob("*.tmp"))


def test_update_config_keeps_original_when_mutator_fails(monkeypatch, tmp_path):
    path = tmp_path / "config.json"
    path.write_text('{"prefix": ">"}', encoding="utf-8")
    monkeypatch.setattr(config_module, "CONFIG_PATH", str(path))
    config_module._config = {}

    def fail(_):
        raise RuntimeError("stop")

    try:
        config_module.update_config(fail)
    except RuntimeError:
        pass
    assert json.loads(path.read_text(encoding="utf-8")) == {"prefix": ">"}
```

- [ ] **Step 2: Verify the update API is missing**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_config.py -q`

Expected: FAIL because `update_config` is not defined.

- [ ] **Step 3: Implement atomic mutation and cache replacement**

```python
# Add to discord-part/core/config.py
import copy
import tempfile
from collections.abc import Callable


def update_config(mutator: Callable[[dict], None]) -> dict:
    global _config
    current = copy.deepcopy(get_config())
    mutator(current)
    directory = os.path.dirname(CONFIG_PATH)
    fd, temp_path = tempfile.mkstemp(prefix="config-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(current, stream, indent=2, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_path, CONFIG_PATH)
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
    _config = current
    return copy.deepcopy(current)
```

- [ ] **Step 4: Migrate all config consumers**

`language_manager.get_guild_language()` reads `get_config()`; `set_guild_language()` calls:

```python
def apply(config):
    config.setdefault("guild_languages", {})[str(guild_id)] = lang_code

update_config(apply)
```

Owner/guild-owner add/remove commands use equivalent mutators for `bot_admin` and `guild_admins`. Delete direct `open(CONFIG_PATH, "w")` and `json.dump()` calls. `get_lang.py` uses `get_config()` rather than opening the file.

- [ ] **Step 5: Verify there is one writer**

Run: `rg -n "json\.dump|open\([^\n]*['\"]w" discord-part -g "*.py"`

Expected: only `core/config.py`, R6 data output and development tooling remain. No permission/language command writes config directly.

- [ ] **Step 6: Run config and full Python tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests -q`

Expected: all tests pass.

- [ ] **Step 7: Commit config consolidation**

```powershell
git add discord-part/core/config.py discord-part/commands/language_manager.py discord-part/commands/owner/add_admin.py discord-part/commands/owner/remove_admin.py discord-part/commands/guild_owner/add_guild_admin.py discord-part/commands/guild_owner/remove_guild_admin.py discord-part/commands/user/get_lang.py discord-part/tests/test_config.py
git commit -m "refactor: centralize Discord config updates"
```

### Task 2: Cache Python R6 Data With Explicit Reload

**Files:**
- Create: `discord-part/features/r6_roll/data_cache.py`
- Create: `discord-part/tests/test_r6_data_cache.py`
- Modify: `discord-part/features/r6_roll/randommap.py`
- Modify: `discord-part/features/r6_roll/randomops.py`
- Modify: `discord-part/commands/owner/r6_update.py`

- [ ] **Step 1: Write failing cache and reload tests**

```python
# discord-part/tests/test_r6_data_cache.py
import json

from features.r6_roll.data_cache import JsonDataCache


def test_json_cache_reads_once_and_reloads(tmp_path):
    path = tmp_path / "data.json"
    path.write_text(json.dumps({"version": 1}), encoding="utf-8")
    cache = JsonDataCache(path)
    assert cache.get()["version"] == 1
    path.write_text(json.dumps({"version": 2}), encoding="utf-8")
    assert cache.get()["version"] == 1
    assert cache.reload()["version"] == 2
```

- [ ] **Step 2: Verify the cache module is missing**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_r6_data_cache.py -q`

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the reusable cache**

```python
# discord-part/features/r6_roll/data_cache.py
import json
from pathlib import Path
from threading import RLock


class JsonDataCache:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._value = None
        self._lock = RLock()

    def get(self):
        with self._lock:
            if self._value is None:
                self._value = json.loads(self.path.read_text(encoding="utf-8"))
            return self._value

    def reload(self):
        with self._lock:
            self._value = json.loads(self.path.read_text(encoding="utf-8"))
            return self._value
```

- [ ] **Step 4: Replace request-time reads and invalidate after updates**

Create module-level `MAP_CACHE` and `OPERATOR_CACHE` using the current paths. `load_maps()` and `load_ops()` return `.get()` so existing call signatures stay compatible. After each successful atomic JSON write in `r6_update.py`, call the relevant `.reload()`.

Write scraper output to a temporary sibling file and `os.replace()` it onto the JSON path so readers never observe a partial file.

- [ ] **Step 5: Run R6 and full Python tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_r6_data_cache.py -q`

Expected: PASS.

Run: `& .\.venv\Scripts\python.exe -m pytest -q`

Expected: all tests pass.

- [ ] **Step 6: Commit R6 caching**

```powershell
git add discord-part/features/r6_roll/data_cache.py discord-part/features/r6_roll/randommap.py discord-part/features/r6_roll/randomops.py discord-part/commands/owner/r6_update.py discord-part/tests/test_r6_data_cache.py
git commit -m "perf: cache Discord R6 data"
```

### Task 3: Remove Repeated Website Queries And Per-Row Filters

**Files:**
- Create: `website-part/test/repository_performance.test.js`
- Modify: `website-part/src/db/users.js`
- Modify: `website-part/src/db/connections.js`
- Modify: `website-part/src/db/guilds.js`

- [ ] **Step 1: Write focused result-shape tests for Map grouping**

```javascript
// website-part/test/repository_performance.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { groupBy } = require('../src/db/connections');

test('groupBy builds one lookup list per connection', () => {
  const grouped = groupBy([
    { connection_id: 2, id: 10 },
    { connection_id: 1, id: 11 },
    { connection_id: 2, id: 12 },
  ], 'connection_id');
  assert.deepEqual(grouped.get(2).map(item => item.id), [10, 12]);
  assert.deepEqual(grouped.get(1).map(item => item.id), [11]);
});
```

- [ ] **Step 2: Verify the helper is missing**

Run: `node --test test/repository_performance.test.js`

Expected: FAIL because `groupBy` is not exported.

- [ ] **Step 3: Add deterministic grouping and parallel reads**

```javascript
function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}
```

In `getAllConnections`, execute connections/roles/users SELECTs through `Promise.all`, build `rolesByConnection` and `usersByConnection`, and map each connection once. Preserve role/user ordering from SQL.

In `getAllGuilds` and `getGuildDetail`, execute independent SELECTs through `Promise.all`; keep config-file parsing outside the promise group and preserve current return shape.

- [ ] **Step 4: Batch relationship inserts**

Replace loops in `replaceConnectionAccess` with one multi-row INSERT per non-empty ID array:

```javascript
const valuesSql = roleIds.map(() => '(?, ?)').join(', ');
const values = roleIds.flatMap(roleId => [connectionId, roleId]);
await conn.execute(
  `INSERT INTO website_connection_roles (connection_id, role_id) VALUES ${valuesSql}`,
  values
);
```

Apply the same pattern to connection users and `updateUserRoles`. Keep all delete/insert operations inside their existing transactions.

- [ ] **Step 5: Run repository and full website tests**

Run: `node --test test/repository_performance.test.js test/admin_user_groups.test.js test/connection_validation.test.js`

Expected: all focused tests pass.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit query improvements**

```powershell
git add website-part/src/db/users.js website-part/src/db/connections.js website-part/src/db/guilds.js website-part/test/repository_performance.test.js
git commit -m "perf: batch and parallelize website queries"
```

### Task 4: Remove Deprecated Logger Shims After Migrating References

**Files:**
- Modify: `discord-part/commands/guild_admin/set_log_channel.py`
- Modify: `discord-part/features/server_logger/__init__.py`
- Delete: `discord-part/features/message_logger/modify.py`
- Delete: `discord-part/features/message_logger/delete.py`
- Delete: `discord-part/features/message_logger/__init__.py`
- Delete: `discord-part/features/user_logger/voice_channel_event_logger.py`
- Delete: `discord-part/features/user_logger/__init__.py`

- [ ] **Step 1: Point the remaining caller at the canonical module**

Replace:

```python
from features.message_logger.modify import set_log_channel
```

with:

```python
from features.server_logger.base import set_log_channel
```

- [ ] **Step 2: Prove no owned source still imports a shim**

Run: `rg -n "features\.message_logger|features\.user_logger" discord-part -g "*.py"`

Expected: only compatibility comments remain before deletion; no executable import.

- [ ] **Step 3: Delete the unused compatibility packages and stale comments**

Delete the five shim files listed above and update `server_logger/__init__.py` so it describes only the canonical event registration API.

- [ ] **Step 4: Validate all command modules resolve**

Run: `& .\.venv\Scripts\python.exe -m compileall -q discord-part shared`

Expected: exit code 0.

Run: `& .\.venv\Scripts\python.exe -m pytest -q`

Expected: all tests pass.

- [ ] **Step 5: Commit shim removal**

```powershell
git add discord-part/commands/guild_admin/set_log_channel.py discord-part/features/server_logger/__init__.py discord-part/features/message_logger discord-part/features/user_logger
git commit -m "refactor: remove deprecated logger shims"
```

### Task 5: Add Real Configuration Examples And Repair Documentation

**Files:**
- Create: `website-part/.env.example`
- Create: `shared/database/config.example.json`
- Modify: `README.md`
- Modify: `README_HK.md`
- Modify: `shared/database/README.md`

- [ ] **Step 1: Add safe, non-secret examples**

```dotenv
# website-part/.env.example
NODE_ENV=development
PORT=3000
SESSION_COOKIE_NAME=connect.sid
SESSION_SECRET=replace-with-a-long-random-value
PROXY_ALLOW_SELF_SIGNED=false
```

```json
{
  "mysql": {
    "host": "localhost",
    "port": 3306,
    "user": "liulianbot",
    "password": "replace-me",
    "database": "discordbot",
    "charset": "utf8mb4"
  }
}
```

- [ ] **Step 2: Correct setup instructions in both root READMEs**

- State that MySQL settings live in `shared/database/config.json` and are created from `config.example.json`.
- Keep Discord token, prefix, owners and updater settings in `discord-part/config.json`.
- Keep the `.env.example` copy step now that the file exists.
- Add `http-proxy-middleware`, `express-rate-limit` and frontend test-only `jsdom` to the correct dependency sections.
- Preserve `discord-part/`, `website-part/`, `shared/` structure documentation.

- [ ] **Step 3: Correct shared database documentation**

Replace `python-part` with `discord-part`; show the exact copy command and the current `mysql` wrapper. Remove speculative SQLite text that is unrelated to current setup.

- [ ] **Step 4: Validate every documented source path exists**

Run: `Test-Path website-part\.env.example; Test-Path shared\database\config.example.json; Test-Path discord-part\default_config.json`

Expected: three `True` values.

- [ ] **Step 5: Validate JSON examples**

Run: `node -e "JSON.parse(require('fs').readFileSync('../shared/database/config.example.json','utf8')); console.log('OK')"`

Working directory: `website-part`

Expected: prints `OK`.

- [ ] **Step 6: Commit documentation repairs**

```powershell
git add website-part/.env.example shared/database/config.example.json README.md README_HK.md shared/database/README.md
git commit -m "docs: align setup examples with runtime config"
```

### Task 6: Add Cross-Platform JavaScript Checks And CI

**Files:**
- Create: `website-part/tools/check-js.js`
- Create: `.github/workflows/ci.yml`
- Modify: `website-part/package.json`

- [ ] **Step 1: Add a platform-independent syntax checker**

```javascript
// website-part/tools/check-js.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(full) : /\.(?:js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

for (const file of ['src', 'public/js', 'test'].flatMap(filesUnder)) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
```

Add package scripts:

```json
{
  "check:js": "node tools/check-js.js",
  "check": "npm run check:js && npm test"
}
```

- [ ] **Step 2: Run the local website quality command**

Run: `npm run check`

Expected: syntax checks and all tests pass.

- [ ] **Step 3: Add Windows/Linux CI jobs**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
  pull_request:

jobs:
  python:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: pip
      - run: python -m pip install -r discord-part/requirements-dev.txt
      - run: python -m pytest -q
      - run: python -m ruff check discord-part shared
      - run: python -m compileall -q discord-part shared

  website:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    defaults:
      run:
        working-directory: website-part
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: website-part/package-lock.json
      - run: npm ci
      - run: npm run check
```

- [ ] **Step 4: Confirm CI tests do not contact real MySQL or Discord**

Run: `rg -n "localhost|createConnection|get_db_conn" discord-part\tests website-part\test`

Expected: any matches are injected fakes or explicit tests of configuration; no test requires a live socket.

- [ ] **Step 5: Commit CI**

```powershell
git add website-part/tools/check-js.js website-part/package.json .github/workflows/ci.yml
git commit -m "ci: validate Python and website on Windows and Linux"
```

### Task 7: Keep Synchronous Discord Repositories Off The Event Loop

**Files:**
- Create: `discord-part/utils/async_io.py`
- Create: `discord-part/tests/test_async_io.py`
- Modify: `discord-part/core/bot_client.py`
- Modify: `discord-part/features/private_voice_chat/private_voice.py`
- Modify: `discord-part/features/server_logger/base.py`
- Modify: `discord-part/commands/guild_admin/set_private_voice.py`
- Modify: `discord-part/commands/guild_admin/setup_voice.py`
- Modify: `discord-part/commands/guild_admin/set_log_channel.py`
- Modify: `discord-part/commands/guild_admin/set_roller_channel.py`
- Modify: `discord-part/commands/guild_admin/set_roller_mode.py`
- Modify: `discord-part/commands/user/roller.py`
- Modify: `discord-part/commands/user/transfer_voice.py`

- [ ] **Step 1: Write a failing thread-delegation test**

```python
# discord-part/tests/test_async_io.py
import asyncio
import threading

from utils.async_io import run_blocking


async def test_run_blocking_uses_a_worker_thread():
    event_loop_thread = threading.get_ident()
    worker_thread = await run_blocking(threading.get_ident)
    assert worker_thread != event_loop_thread


async def test_run_blocking_keeps_the_loop_responsive():
    started = threading.Event()
    release = threading.Event()

    def blocking():
        started.set()
        release.wait(timeout=1)
        return 42

    task = asyncio.create_task(run_blocking(blocking))
    while not started.is_set():
        await asyncio.sleep(0)
    marker = await asyncio.sleep(0, result="responsive")
    release.set()
    assert await task == 42
    assert marker == "responsive"
```

- [ ] **Step 2: Verify the helper is missing**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_async_io.py -q`

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Add one executor helper**

```python
# discord-part/utils/async_io.py
import asyncio
from functools import partial


async def run_blocking(function, /, *args, **kwargs):
    return await asyncio.to_thread(partial(function, *args, **kwargs))
```

- [ ] **Step 4: Make private voice initialization and persistence asynchronous**

`PrivateVoiceManager.__init__` must not query the database. Add:

```python
async def initialize(self) -> None:
    self.trigger_channels = await run_blocking(self.repository.load_triggers)

async def save_channel_config(self, guild_id, channel_id, owner_id, config):
    await run_blocking(self.repository.save, guild_id, channel_id, owner_id, config)

async def get_channel_config(self, channel_id):
    return await run_blocking(self.repository.get_config, channel_id)

async def transfer_channel_owner(self, channel_id, new_owner_id):
    # Persist first; update the in-memory maps only after this succeeds.
    await run_blocking(self.repository.update_owner, channel_id, new_owner_id)
```

Await these methods from set/setup/transfer commands and `create_private_channel`. In `MyClient.on_ready`, call `await self.private_voice_manager.initialize()` before starting cleanup. The cleanup loop calls `await run_blocking(self.repository.cleanup_old, retention_days)`.

- [ ] **Step 5: Offload logger and roller repository calls**

In async server logger functions, replace direct `get_log_channel(guild.id)` with `await run_blocking(get_log_channel, guild.id)`. In async set-log, set-roller, roller-mode and roller commands, wrap every sync `get_*`/`set_*` repository call with `await run_blocking(...)` while keeping existing command responses.

- [ ] **Step 6: Run async and full Python tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_async_io.py -q`

Expected: `2 passed`.

Run: `& .\.venv\Scripts\python.exe -m pytest -q`

Expected: all tests pass.

- [ ] **Step 7: Commit event-loop repository boundaries**

```powershell
git add discord-part/utils/async_io.py discord-part/core/bot_client.py discord-part/features/private_voice_chat/private_voice.py discord-part/features/server_logger/base.py discord-part/commands/guild_admin/set_private_voice.py discord-part/commands/guild_admin/setup_voice.py discord-part/commands/guild_admin/set_log_channel.py discord-part/commands/guild_admin/set_roller_channel.py discord-part/commands/guild_admin/set_roller_mode.py discord-part/commands/user/roller.py discord-part/commands/user/transfer_voice.py discord-part/tests/test_async_io.py
git commit -m "perf: offload Discord repository calls"
```

### Task 8: Run The Full Repository Acceptance Suite

**Files:**
- Modify only if validation exposes a defect in files changed by the four implementation plans.

- [ ] **Step 1: Run Python tests and static checks**

Run: `& .\.venv\Scripts\python.exe -m pytest -q`

Expected: all tests pass.

Run: `& .\.venv\Scripts\python.exe -m ruff check discord-part shared`

Expected: exit code 0.

Run: `& .\.venv\Scripts\python.exe -m compileall -q discord-part shared`

Expected: exit code 0.

- [ ] **Step 2: Run website tests and syntax checks**

Run: `npm run check`

Working directory: `website-part`

Expected: all JavaScript syntax checks and Node tests pass.

- [ ] **Step 3: Run a real migration check when local MySQL is available**

Start from a backup of the configured database. Launch the Discord migration runner twice and website initialization twice. Expected on both second runs: no duplicate-key/duplicate-column failures, no additional private voice duplicates, and all existing users, roles, connections and valid sessions remain.

If MySQL is unavailable, record the connection error and do not claim real-DB migration verification; the mock/static suite must still pass.

- [ ] **Step 4: Run website HTTP and WebSocket smoke tests**

Start the website on an unused local port. Verify login, Remember Me cookie expiry, protected page redirect, admin authorization, hidden navigation behavior, authorized direct `/connect/<slug>/` access and signed-session WebSocket upgrade.

- [ ] **Step 5: Run final repository hygiene checks**

Run: `git diff --check`

Expected: exit code 0.

Run: `git status --short`

Expected: no uncommitted files after all task commits.

- [ ] **Step 6: Record final evidence**

In the final implementation summary, report exact test counts, CI/static commands, whether real MySQL was available, migration results, browser viewport checks and any residual risk. Do not describe skipped runtime checks as passing.
