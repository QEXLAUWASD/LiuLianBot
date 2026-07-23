# Python Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 Discord/Python 已確認的資料一致性、啟動可用性、時間處理、updater 憑證及 event-loop 阻塞問題，並建立可持續的 Python 測試基線。

**Architecture:** 模組 import 必須保持無 I/O；資料表建立與升級集中至 migration runner；私人語音資料存取封裝於 repository；Discord coroutine 將同步 Git 工作交給 thread executor。所有外部指令契約保持不變。

**Tech Stack:** Python 3.11、discord.py 2.3、PyMySQL、pytest、pytest-asyncio、Ruff

---

## File Map

- Create `pyproject.toml`: pytest 與 Ruff 共用設定。
- Create `discord-part/requirements-dev.txt`: Python 開發與測試相依。
- Create `discord-part/tests/conftest.py`: 將 `discord-part` 加入 import path。
- Create `discord-part/tests/test_migrations.py`: migration runner 與 import 無 I/O 測試。
- Create `discord-part/tests/test_private_voice_repository.py`: 私人語音持久化測試。
- Create `discord-part/tests/test_member_events.py`: timezone-aware 時間測試。
- Create `discord-part/tests/test_set_private_voice.py`: mention 與 ID 相容測試。
- Create `discord-part/tests/test_updater.py`: credential、dirty tree 與 fast-forward 測試。
- Create `discord-part/tests/test_update_command.py`: event-loop 非阻塞測試。
- Create `discord-part/utils/migrations.py`: 集中 migration runner。
- Create `discord-part/features/private_voice_chat/repository.py`: 私人語音資料存取。
- Modify `discord-part/main.py`: 在 bot 啟動前執行 migrations。
- Modify `discord-part/features/private_voice_chat/private_voice.py`: 移除 import-time I/O 並依賴 repository。
- Modify `discord-part/features/server_logger/base.py`: 移除 import-time migration 並統一 UTC。
- Modify `discord-part/features/server_logger/member_events.py`: 使用 timezone-aware 時間來源。
- Modify `discord-part/features/r6_roll/roller_channel.py`: 移除 import-time migration。
- Modify `discord-part/commands/guild_admin/remove_private_voice.py`: 同步移除 DB trigger。
- Modify `discord-part/commands/guild_admin/set_private_voice.py`: 正確解析 voice mention。
- Modify `discord-part/updater/updater.py`: 不持久化 token、不吞掉 dirty tree、只允許 fast-forward。
- Modify `discord-part/commands/owner/update.py`: 將同步更新移至 thread executor。
- Modify `discord-part/core/bot_client.py`: 對外隱藏內部 exception detail。

### Task 1: Add Python Test And Lint Baseline

**Files:**
- Create: `pyproject.toml`
- Create: `discord-part/requirements-dev.txt`
- Create: `discord-part/tests/conftest.py`

- [ ] **Step 1: Add deterministic tool configuration**

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["discord-part/tests"]
asyncio_mode = "auto"

[tool.ruff]
target-version = "py311"
line-length = 100
src = ["discord-part", "shared"]

[tool.ruff.lint]
select = ["E9", "F63", "F7", "F82"]
```

```text
# discord-part/requirements-dev.txt
-r requirements.txt
pytest>=8.0,<9
pytest-asyncio>=0.23,<2
ruff>=0.9,<1
```

```python
# discord-part/tests/conftest.py
import sys
from pathlib import Path

DISCORD_PART = Path(__file__).resolve().parents[1]
if str(DISCORD_PART) not in sys.path:
    sys.path.insert(0, str(DISCORD_PART))
```

- [ ] **Step 2: Install the development requirements**

Run: `& .\.venv\Scripts\python.exe -m pip install -r discord-part\requirements-dev.txt`

Expected: exit code 0 and pytest/Ruff are installed in `.venv`.

- [ ] **Step 3: Run the empty baseline**

Run: `& .\.venv\Scripts\python.exe -m pytest -q`

Expected: exit code 5 with `no tests ran`; this confirms discovery is using the intended directory.

- [ ] **Step 4: Commit the tooling baseline**

```powershell
git add pyproject.toml discord-part/requirements-dev.txt discord-part/tests/conftest.py
git commit -m "test: add Python quality baseline"
```

### Task 2: Centralize Startup Migrations And Remove Import-Time DB I/O

**Files:**
- Create: `discord-part/tests/test_migrations.py`
- Create: `discord-part/utils/migrations.py`
- Modify: `discord-part/main.py:35-63`
- Modify: `discord-part/features/private_voice_chat/private_voice.py:8-31`
- Modify: `discord-part/features/server_logger/base.py:21-43`
- Modify: `discord-part/features/r6_roll/roller_channel.py:7-36`

- [ ] **Step 1: Write tests proving import is side-effect free and migrations close connections**

```python
# discord-part/tests/test_migrations.py
import importlib
import sys
from unittest.mock import MagicMock


def test_feature_imports_do_not_open_database(monkeypatch):
    connect = MagicMock(side_effect=AssertionError("database opened during import"))
    monkeypatch.setattr("utils.database.get_db_conn", connect)
    for name in (
        "features.private_voice_chat.private_voice",
        "features.server_logger.base",
        "features.r6_roll.roller_channel",
    ):
        sys.modules.pop(name, None)
        importlib.import_module(name)
    connect.assert_not_called()


def test_run_migrations_commits_and_closes():
    from utils.migrations import Migration, run_migrations

    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []
    apply = MagicMock()
    migration = Migration("001", "test", apply)
    run_migrations(connection_factory=lambda: conn, migrations=(migration,))

    apply.assert_called_once_with(conn)
    conn.commit.assert_called_once_with()
    conn.close.assert_called_once_with()


def test_run_migrations_skips_recorded_versions():
    from utils.migrations import Migration, run_migrations

    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = [("001",)]
    apply = MagicMock()
    run_migrations(
        connection_factory=lambda: conn,
        migrations=(Migration("001", "already applied", apply),),
    )
    apply.assert_not_called()
```

- [ ] **Step 2: Run the tests to verify the current import behavior fails**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_migrations.py -q`

Expected: FAIL because feature imports call `get_db_conn()` and `utils.migrations` does not exist.

- [ ] **Step 3: Add the migration runner**

```python
# discord-part/utils/migrations.py
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from utils.database import get_db_conn

@dataclass(frozen=True)
class Migration:
    version: str
    name: str
    apply: Callable[[Any], None]


def create_log_channel_table(conn) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS guild_log_channels ("
            "guild_id BIGINT PRIMARY KEY, channel_id BIGINT NOT NULL, "
            "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP "
            "ON UPDATE CURRENT_TIMESTAMP)"
        )


def create_roller_channel_table(conn) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS guild_roller_channels ("
            "guild_id BIGINT PRIMARY KEY, channel_id BIGINT NOT NULL, "
            "dm_result TINYINT NOT NULL DEFAULT 1, "
            "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP "
            "ON UPDATE CURRENT_TIMESTAMP)"
        )
        cursor.execute(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_NAME='guild_roller_channels' AND COLUMN_NAME='dm_result'"
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute(
                "ALTER TABLE guild_roller_channels "
                "ADD COLUMN dm_result TINYINT NOT NULL DEFAULT 1"
            )


DEFAULT_MIGRATIONS: tuple[Migration, ...] = (
    Migration("001", "create log channel table", create_log_channel_table),
    Migration("002", "create roller channel table", create_roller_channel_table),
)


def run_migrations(
    connection_factory=get_db_conn,
    migrations: Iterable[Migration] = DEFAULT_MIGRATIONS,
) -> None:
    conn = connection_factory()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "version VARCHAR(32) PRIMARY KEY, name VARCHAR(255) NOT NULL, "
                "applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
            cursor.execute("SELECT version FROM schema_migrations")
            applied = {str(row[0]) for row in cursor.fetchall()}
        for migration in migrations:
            if migration.version in applied:
                continue
            migration.apply(conn)
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO schema_migrations (version, name) VALUES (%s, %s)",
                    (migration.version, migration.name),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

- [ ] **Step 4: Remove the three module-level initializer calls**

Delete `init_private_voice_table()`, `init_log_channel_table()` and `init_roller_channel_table()` calls at module scope. Keep CRUD functions temporarily; Task 3 moves private voice persistence.

In `main.py`, replace the current DB probe with:

```python
from utils.database import ensure_database
from utils.migrations import run_migrations


def initialize_database(logger) -> None:
    ensure_database()
    run_migrations()
    logger.info("MySQL migrations completed")


initialize_database(logger)
```

Do not swallow migration failures. A schema failure must stop startup before `bot.run()`.

- [ ] **Step 5: Run migration and import tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_migrations.py -q`

Expected: `2 passed`.

- [ ] **Step 6: Commit the startup boundary**

```powershell
git add discord-part/utils/migrations.py discord-part/main.py discord-part/features/private_voice_chat/private_voice.py discord-part/features/server_logger/base.py discord-part/features/r6_roll/roller_channel.py discord-part/tests/test_migrations.py
git commit -m "refactor: centralize Discord database migrations"
```

### Task 3: Make Private Voice Persistence Deterministic

**Files:**
- Create: `discord-part/features/private_voice_chat/repository.py`
- Create: `discord-part/tests/test_private_voice_repository.py`
- Modify: `discord-part/utils/migrations.py`
- Modify: `discord-part/features/private_voice_chat/private_voice.py:33-194`
- Modify: `discord-part/commands/guild_admin/remove_private_voice.py:15-23`

- [ ] **Step 1: Write repository behavior tests with a fake connection**

```python
# discord-part/tests/test_private_voice_repository.py
from unittest.mock import MagicMock

from features.private_voice_chat.repository import PrivateVoiceRepository


def make_repo():
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    return PrivateVoiceRepository(lambda: conn), conn, cursor


def test_save_trigger_uses_one_trigger_key_per_guild():
    repo, conn, cursor = make_repo()
    repo.save(10, 20, 30, {"type": "trigger"})
    sql, params = cursor.execute.call_args.args
    assert "trigger_guild_id" in sql
    assert params[4] == 10
    conn.commit.assert_called_once_with()


def test_remove_trigger_deletes_persisted_row():
    repo, conn, cursor = make_repo()
    repo.remove_trigger(10)
    cursor.execute.assert_called_once_with(
        "DELETE FROM private_voice_channels WHERE guild_id=%s AND config_type='trigger'",
        (10,),
    )
    conn.commit.assert_called_once_with()
```

- [ ] **Step 2: Run the tests to verify the repository is missing**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_private_voice_repository.py -q`

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Add the private voice migration**

Add `migrate_private_voice_table(conn)` to `utils/migrations.py` and append `Migration("003", "normalize private voice persistence", migrate_private_voice_table)` to `DEFAULT_MIGRATIONS`. The function must execute these statements in order:

```python
def migrate_private_voice_table(conn) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS private_voice_channels ("
            "id INT AUTO_INCREMENT PRIMARY KEY, guild_id BIGINT NOT NULL, "
            "channel_id BIGINT NOT NULL, owner_id BIGINT NOT NULL, "
            "config_json JSON, config_type VARCHAR(16) NOT NULL DEFAULT 'private', "
            "trigger_guild_id BIGINT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
            "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)"
        )
        for statement in (
            "ALTER TABLE private_voice_channels ADD COLUMN config_type VARCHAR(16) NOT NULL DEFAULT 'private'",
            "ALTER TABLE private_voice_channels ADD COLUMN trigger_guild_id BIGINT NULL",
        ):
            try:
                cursor.execute(statement)
            except Exception as exc:
                if getattr(exc, "args", [None])[0] != 1060:
                    raise
        cursor.execute(
            "UPDATE private_voice_channels SET "
            "config_type=COALESCE(JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.type')), 'private'), "
            "trigger_guild_id=CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.type'))='trigger' "
            "THEN guild_id ELSE NULL END"
        )
        cursor.execute(
            "SELECT id, guild_id, channel_id, config_type FROM private_voice_channels "
            "ORDER BY updated_at DESC, id DESC"
        )
        rows = cursor.fetchall()
        seen_channels: set[int] = set()
        seen_triggers: set[int] = set()
        duplicate_ids: list[int] = []
        for row_id, guild_id, channel_id, config_type in rows:
            duplicate = channel_id in seen_channels
            if config_type == "trigger":
                duplicate = duplicate or guild_id in seen_triggers
                seen_triggers.add(guild_id)
            if duplicate:
                duplicate_ids.append(row_id)
            else:
                seen_channels.add(channel_id)
        if duplicate_ids:
            placeholders = ",".join(["%s"] * len(duplicate_ids))
            cursor.execute(
                f"DELETE FROM private_voice_channels WHERE id IN ({placeholders})",
                duplicate_ids,
            )
        for statement in (
            "ALTER TABLE private_voice_channels ADD UNIQUE KEY uq_private_voice_channel (channel_id)",
            "ALTER TABLE private_voice_channels ADD UNIQUE KEY uq_private_voice_trigger_guild (trigger_guild_id)",
        ):
            try:
                cursor.execute(statement)
            except Exception as exc:
                if getattr(exc, "args", [None])[0] != 1061:
                    raise
```

- [ ] **Step 4: Implement the repository**

```python
# discord-part/features/private_voice_chat/repository.py
import json

from utils.database import get_db_conn


class PrivateVoiceRepository:
    def __init__(self, connection_factory=get_db_conn):
        self._connection_factory = connection_factory

    def save(self, guild_id, channel_id, owner_id, config) -> None:
        config_type = config.get("type", "private")
        trigger_guild_id = guild_id if config_type == "trigger" else None
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO private_voice_channels "
                    "(guild_id, channel_id, owner_id, config_json, config_type, trigger_guild_id) "
                    "VALUES (%s, %s, %s, %s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id), "
                    "owner_id=VALUES(owner_id), config_json=VALUES(config_json), "
                    "config_type=VALUES(config_type), trigger_guild_id=VALUES(trigger_guild_id), "
                    "updated_at=NOW()",
                    (
                        guild_id,
                        channel_id,
                        owner_id,
                        json.dumps(config, ensure_ascii=False),
                        config_type,
                        trigger_guild_id,
                    ),
                )
            conn.commit()
        finally:
            conn.close()

    def remove_trigger(self, guild_id) -> None:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM private_voice_channels "
                    "WHERE guild_id=%s AND config_type='trigger'",
                    (guild_id,),
                )
            conn.commit()
        finally:
            conn.close()

    def get_config(self, channel_id):
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT config_json FROM private_voice_channels WHERE channel_id=%s",
                    (channel_id,),
                )
                row = cursor.fetchone()
                return json.loads(row[0]) if row else None
        finally:
            conn.close()

    def update_config(self, channel_id, config) -> None:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE private_voice_channels SET config_json=%s, updated_at=NOW() "
                    "WHERE channel_id=%s",
                    (json.dumps(config, ensure_ascii=False), channel_id),
                )
            conn.commit()
        finally:
            conn.close()

    def delete(self, channel_id) -> None:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM private_voice_channels WHERE channel_id=%s",
                    (channel_id,),
                )
            conn.commit()
        finally:
            conn.close()

    def update_owner(self, channel_id, owner_id) -> None:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE private_voice_channels SET owner_id=%s, updated_at=NOW() "
                    "WHERE channel_id=%s",
                    (owner_id, channel_id),
                )
            conn.commit()
        finally:
            conn.close()

    def load_triggers(self) -> dict[int, int]:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT guild_id, channel_id FROM private_voice_channels "
                    "WHERE config_type='trigger'"
                )
                return {int(guild_id): int(channel_id) for guild_id, channel_id in cursor.fetchall()}
        finally:
            conn.close()

    def cleanup_old(self, retention_days: int) -> int:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM private_voice_channels WHERE config_type='private' "
                    "AND updated_at < DATE_SUB(NOW(), INTERVAL %s DAY)",
                    (retention_days,),
                )
                deleted = cursor.rowcount
            conn.commit()
            return deleted
        finally:
            conn.close()
```

Inject one `PrivateVoiceRepository` into `PrivateVoiceManager.__init__`. Replace the old module-level CRUD functions with calls to the repository methods shown above; do not keep two persistence implementations.

- [ ] **Step 5: Persist trigger removal**

Update `PrivateVoiceManager.remove_trigger_channel`:

```python
def remove_trigger_channel(self, guild_id: int) -> None:
    self.repository.remove_trigger(guild_id)
    self.trigger_channels.pop(guild_id, None)
```

The command continues calling `manager.remove_trigger_channel(message.guild.id)` and keeps its existing response.

- [ ] **Step 6: Run repository and migration tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_private_voice_repository.py discord-part\tests\test_migrations.py -q`

Expected: all tests pass.

- [ ] **Step 7: Commit private voice persistence**

```powershell
git add discord-part/features/private_voice_chat/repository.py discord-part/features/private_voice_chat/private_voice.py discord-part/commands/guild_admin/remove_private_voice.py discord-part/utils/migrations.py discord-part/tests/test_private_voice_repository.py discord-part/tests/test_migrations.py
git commit -m "fix: make private voice settings persistent"
```

### Task 4: Use Timezone-Aware Logger Timestamps

**Files:**
- Create: `discord-part/tests/test_member_events.py`
- Modify: `discord-part/features/server_logger/base.py:272-273`
- Modify: `discord-part/features/server_logger/member_events.py:7`

- [ ] **Step 1: Write a failing UTC test**

```python
# discord-part/tests/test_member_events.py
from datetime import datetime, timezone

from features.server_logger.base import _now
from features.server_logger.member_events import _format_timedelta


def test_now_is_timezone_aware_utc():
    current = _now()
    assert current.tzinfo is not None
    assert current.utcoffset().total_seconds() == 0


def test_member_age_accepts_discord_aware_timestamp():
    created_at = datetime(2026, 7, 20, tzinfo=timezone.utc)
    now = datetime(2026, 7, 23, 5, 30, tzinfo=timezone.utc)
    assert _format_timedelta(now - created_at) == "3d 5h 30m"
```

- [ ] **Step 2: Verify the UTC assertion fails**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_member_events.py -q`

Expected: FAIL because `_now()` returns a naive datetime.

- [ ] **Step 3: Replace the shared clock**

```python
def _now() -> datetime:
    return discord.utils.utcnow()
```

Remove the unused `datetime` import from `member_events.py`; both join and remove handlers already use `_now()`.

- [ ] **Step 4: Run the logger tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_member_events.py -q`

Expected: `2 passed`.

- [ ] **Step 5: Commit the UTC fix**

```powershell
git add discord-part/features/server_logger/base.py discord-part/features/server_logger/member_events.py discord-part/tests/test_member_events.py
git commit -m "fix: use aware UTC timestamps in member logs"
```

### Task 5: Accept Voice Channel Mentions Without Changing The Command Contract

**Files:**
- Create: `discord-part/tests/test_set_private_voice.py`
- Modify: `discord-part/commands/guild_admin/set_private_voice.py:58-72`

- [ ] **Step 1: Write tests for mention-first and numeric-ID parsing**

```python
# discord-part/tests/test_set_private_voice.py
from types import SimpleNamespace

from commands.guild_admin.set_private_voice import resolve_voice_channel


def test_resolve_voice_channel_prefers_first_mention():
    mentioned = object()
    guild = SimpleNamespace(get_channel=lambda _: None)
    message = SimpleNamespace(channel_mentions=[mentioned], guild=guild)
    assert resolve_voice_channel(message, "not-an-id") is mentioned


def test_resolve_voice_channel_accepts_numeric_id():
    expected = object()
    guild = SimpleNamespace(get_channel=lambda value: expected if value == 123 else None)
    message = SimpleNamespace(channel_mentions=[], guild=guild)
    assert resolve_voice_channel(message, "<#123>") is expected
```

- [ ] **Step 2: Verify the helper is missing**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_set_private_voice.py -q`

Expected: FAIL because `resolve_voice_channel` is not defined.

- [ ] **Step 3: Add the pure parser and use it in the command**

```python
def resolve_voice_channel(message, raw_value):
    if message.channel_mentions:
        return message.channel_mentions[0]
    try:
        channel_id = int(raw_value.strip("<>#"))
    except ValueError:
        return None
    return message.guild.get_channel(channel_id)
```

Replace the current mention rejection and integer parsing with `channel = resolve_voice_channel(message, parts[1])`. Keep the existing `discord.VoiceChannel` validation and localized responses.

- [ ] **Step 4: Run parser tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_set_private_voice.py -q`

Expected: `2 passed`.

- [ ] **Step 5: Commit mention compatibility**

```powershell
git add discord-part/commands/guild_admin/set_private_voice.py discord-part/tests/test_set_private_voice.py
git commit -m "fix: accept private voice channel mentions"
```

### Task 6: Make The Git Updater Credential-Safe And Non-Destructive

**Files:**
- Create: `discord-part/tests/test_updater.py`
- Modify: `discord-part/updater/updater.py:55-179`

- [ ] **Step 1: Write tests for public remote URLs, dirty-tree refusal and fast-forward update**

```python
# discord-part/tests/test_updater.py
from unittest.mock import call

from updater import updater


def test_private_token_is_not_written_to_origin(monkeypatch, tmp_path):
    (tmp_path / ".git").mkdir()
    calls = []

    def fake_git(args, cwd=None):
        calls.append(args)
        if args == ["status", "--porcelain"]:
            return 0, "", ""
        if args[:2] == ["rev-parse", "--short"]:
            return 0, "abc123", ""
        if args[:2] == ["rev-list", "--count"]:
            return 0, "0", ""
        return 0, "", ""

    monkeypatch.setattr(updater, "_get_repo_root", lambda: tmp_path)
    monkeypatch.setattr(updater, "_run_git", fake_git)
    ok, _ = updater.fetch_and_pull("owner/repo", "secret-token", "master")

    assert ok
    assert ["remote", "set-url", "origin", "https://github.com/owner/repo.git"] in calls
    assert all("secret-token" not in " ".join(args) for args in calls if args[:2] == ["remote", "set-url"])


def test_dirty_worktree_aborts_before_fetch(monkeypatch, tmp_path):
    (tmp_path / ".git").mkdir()
    monkeypatch.setattr(updater, "_get_repo_root", lambda: tmp_path)
    monkeypatch.setattr(
        updater,
        "_run_git",
        lambda args, cwd=None: (0, " M local.py", "") if args == ["status", "--porcelain"] else (0, "", ""),
    )
    ok, message = updater.fetch_and_pull("owner/repo", "", "master")
    assert not ok
    assert "未提交" in message
```

- [ ] **Step 2: Verify current updater behavior fails the safety tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_updater.py -q`

Expected: FAIL because the current updater writes the token into origin and stashes without restoring it.

- [ ] **Step 3: Replace tokenized remotes and destructive reset**

Implement these helpers in `updater.py`:

```python
import base64


def _fetch_args(remote_url: str, branch: str, token: str) -> list[str]:
    if not token:
        return ["fetch", remote_url, branch]
    credential = base64.b64encode(
        f"x-access-token:{token}".encode("utf-8")
    ).decode("ascii")
    return [
        "-c",
        f"http.extraHeader=Authorization: Basic {credential}",
        "fetch",
        remote_url,
        branch,
    ]


def _worktree_is_clean() -> bool:
    rc, stdout, _ = _run_git(["status", "--porcelain"])
    return rc == 0 and not stdout
```

In `fetch_and_pull`:

```python
remote_url = f"https://github.com/{github_repo}.git"
if not _worktree_is_clean():
    return False, "工作目錄有未提交變更；請先提交或自行 stash 後再更新"

rc, _, stderr = _run_git(["remote", "set-url", "origin", remote_url])
if rc != 0:
    return False, f"設定 remote URL 失敗: {stderr}"

rc, _, stderr = _run_git(_fetch_args(remote_url, branch, github_token))
if rc != 0:
    return False, f"Fetch 失敗: {stderr}"

rc, stdout, stderr = _run_git(["merge", "--ff-only", "FETCH_HEAD"])
if rc != 0:
    return False, f"更新不是 fast-forward，已停止且未修改工作目錄: {stderr}"
```

Delete the automatic stash, `reset --hard` and pull fallback paths.

- [ ] **Step 4: Run updater safety tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_updater.py -q`

Expected: all tests pass and no assertion contains the raw token.

- [ ] **Step 5: Commit updater safety**

```powershell
git add discord-part/updater/updater.py discord-part/tests/test_updater.py
git commit -m "fix: make bot updater credential-safe"
```

### Task 7: Keep Synchronous Update Work Off The Discord Event Loop

**Files:**
- Create: `discord-part/tests/test_update_command.py`
- Modify: `discord-part/commands/owner/update.py:150-157`
- Modify: `discord-part/core/bot_client.py:207-219`

- [ ] **Step 1: Write a source-level regression test for thread delegation**

```python
# discord-part/tests/test_update_command.py
import ast
from pathlib import Path


def test_update_command_delegates_perform_update_to_thread():
    path = Path("discord-part/commands/owner/update.py")
    tree = ast.parse(path.read_text(encoding="utf-8"))
    calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)]
    assert any(
        isinstance(call.func, ast.Attribute)
        and call.func.attr == "to_thread"
        and call.args
        and getattr(call.args[0], "id", None) == "perform_update"
        for call in calls
    )
```

- [ ] **Step 2: Verify the test fails against the direct call**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests\test_update_command.py -q`

Expected: FAIL because `perform_update()` is called directly.

- [ ] **Step 3: Delegate the update operation to a worker thread**

```python
success, result_msg = await asyncio.to_thread(
    perform_update,
    github_repo=github_repo,
    github_token=github_token,
    branch=branch,
    auto_restart=auto_restart,
)
```

In `core/bot_client.py`, keep `exc_info=True` in logs but replace the public error interpolation with a stable localized message that does not include `str(e)`.

Generate a short reference before logging so the public response can be correlated without exposing internals:

```python
from uuid import uuid4

error_id = uuid4().hex[:12]
self.logger.error(
    "Command '%s' failed [reference=%s]",
    command_name,
    error_id,
    exc_info=True,
)
message = get_translation("error_executing_command", guild_id)
await responder(content=f"{message} (Reference: {error_id})")
```

- [ ] **Step 4: Run focused and full Python tests**

Run: `& .\.venv\Scripts\python.exe -m pytest discord-part\tests -q`

Expected: all Python tests pass.

- [ ] **Step 5: Run static validation**

Run: `& .\.venv\Scripts\python.exe -m ruff check discord-part shared`

Expected: exit code 0.

Run: `& .\.venv\Scripts\python.exe -m compileall -q discord-part shared`

Expected: exit code 0.

- [ ] **Step 6: Commit event-loop and error-surface fixes**

```powershell
git add discord-part/commands/owner/update.py discord-part/core/bot_client.py discord-part/tests/test_update_command.py
git commit -m "fix: keep updater work off Discord event loop"
```

### Task 8: Validate The Python Subproject End To End

**Files:**
- Modify only if a validation failure identifies a defect in files already touched by Tasks 1-7.

- [ ] **Step 1: Run all Python tests**

Run: `& .\.venv\Scripts\python.exe -m pytest -q`

Expected: all tests pass.

- [ ] **Step 2: Run lint and syntax validation**

Run: `& .\.venv\Scripts\python.exe -m ruff check discord-part shared`

Expected: exit code 0.

Run: `& .\.venv\Scripts\python.exe -m compileall -q discord-part shared`

Expected: exit code 0.

- [ ] **Step 3: Verify imports without a running MySQL server**

Run: `& .\.venv\Scripts\python.exe -B -c "import sys; sys.path.insert(0, 'discord-part'); import commands.handler; print(len(commands.handler.handler.list_commands()))"`

Expected: prints the command count without MySQL connection error 2003.

- [ ] **Step 4: Check the final diff**

Run: `git diff --check`

Expected: exit code 0.

Run: `git status --short`

Expected: only intentional Python plan changes are present, or no output after all task commits.
