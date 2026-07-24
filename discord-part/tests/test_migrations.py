import importlib
import sys
from unittest.mock import MagicMock, call

import pytest


def test_feature_imports_do_not_open_database(monkeypatch):
    database = importlib.import_module("utils.database")
    get_db_conn = MagicMock(
        side_effect=AssertionError("feature import attempted to open the database")
    )
    monkeypatch.setattr(database, "get_db_conn", get_db_conn)

    for module_name in (
        "features.private_voice_chat.private_voice",
        "features.server_logger.base",
        "features.r6_roll.roller_channel",
    ):
        sys.modules.pop(module_name, None)
        importlib.import_module(module_name)

    get_db_conn.assert_not_called()


def test_main_import_does_not_initialize_database(monkeypatch):
    bot_client = importlib.import_module("core.bot_client")
    config = importlib.import_module("core.config")
    database = importlib.import_module("utils.database")
    migrations = importlib.import_module("utils.migrations")
    ensure_database = MagicMock()
    get_db_conn = MagicMock()
    run_migrations = MagicMock()
    monkeypatch.setattr(bot_client, "MyClient", MagicMock())
    monkeypatch.setattr(config, "load_config", MagicMock(return_value={}))
    monkeypatch.setattr(config, "get_logger", MagicMock(return_value=MagicMock()))
    monkeypatch.setattr(config, "init_permissions", MagicMock())
    monkeypatch.setattr(config, "get_bot_token", MagicMock(return_value="token"))
    monkeypatch.setattr(config, "get_command_prefix", MagicMock(return_value=">"))
    monkeypatch.setattr(config, "get_first_owner_id", MagicMock(return_value=1))
    monkeypatch.setattr(database, "ensure_database", ensure_database)
    monkeypatch.setattr(database, "get_db_conn", get_db_conn)
    monkeypatch.setattr(migrations, "run_migrations", run_migrations)

    sys.modules.pop("main", None)
    importlib.import_module("main")

    ensure_database.assert_not_called()
    get_db_conn.assert_not_called()
    run_migrations.assert_not_called()


def test_initialize_database_runs_schema_setup_and_migrations_in_order(monkeypatch):
    bot_client = importlib.import_module("core.bot_client")
    config = importlib.import_module("core.config")
    database = importlib.import_module("utils.database")
    migrations = importlib.import_module("utils.migrations")
    actions = MagicMock()
    monkeypatch.setattr(bot_client, "MyClient", MagicMock())
    monkeypatch.setattr(config, "load_config", MagicMock(return_value={}))
    monkeypatch.setattr(config, "get_logger", MagicMock(return_value=actions))
    monkeypatch.setattr(config, "init_permissions", MagicMock())
    monkeypatch.setattr(config, "get_bot_token", MagicMock(return_value="token"))
    monkeypatch.setattr(config, "get_command_prefix", MagicMock(return_value=">"))
    monkeypatch.setattr(config, "get_first_owner_id", MagicMock(return_value=1))
    monkeypatch.setattr(database, "ensure_database", actions.ensure_database)
    monkeypatch.setattr(migrations, "run_migrations", actions.run_migrations)

    sys.modules.pop("main", None)
    main = importlib.import_module("main")
    main.initialize_database(actions)

    assert actions.mock_calls == [
        call.ensure_database(),
        call.run_migrations(),
        call.info("MySQL migrations completed"),
    ]


def test_run_migrations_commits_and_closes():
    from utils.migrations import Migration, run_migrations

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []
    apply = MagicMock()

    run_migrations(
        connection_factory=MagicMock(return_value=connection),
        migrations=(Migration("001", "test", apply),),
    )

    apply.assert_called_once_with(connection)
    connection.commit.assert_called_once_with()
    connection.close.assert_called_once_with()


def test_run_migrations_skips_recorded_versions():
    from utils.migrations import Migration, run_migrations

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = [("001",)]
    apply = MagicMock()

    run_migrations(
        connection_factory=MagicMock(return_value=connection),
        migrations=(Migration("001", "test", apply),),
    )

    apply.assert_not_called()


def test_run_migrations_rolls_back_and_closes_on_failure():
    from utils.migrations import Migration, run_migrations

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []
    error = RuntimeError("migration failed")

    with pytest.raises(RuntimeError, match="migration failed"):
        run_migrations(
            connection_factory=MagicMock(return_value=connection),
            migrations=(
                Migration("001", "test", MagicMock(side_effect=error)),
            ),
        )

    connection.rollback.assert_called_once_with()
    connection.commit.assert_not_called()
    connection.close.assert_called_once_with()


def test_create_log_channel_table_preserves_existing_schema():
    from utils.migrations import create_log_channel_table

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value

    create_log_channel_table(connection)

    sql = " ".join(call.args[0] for call in cursor.execute.call_args_list)
    assert "CREATE TABLE IF NOT EXISTS guild_log_channels" in sql
    assert "guild_id BIGINT PRIMARY KEY" in sql
    assert "channel_id BIGINT NOT NULL" in sql


def test_create_roller_channel_table_adds_missing_dm_result():
    from utils.migrations import create_roller_channel_table

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = (0,)

    create_roller_channel_table(connection)

    sql = " ".join(call.args[0] for call in cursor.execute.call_args_list)
    assert "CREATE TABLE IF NOT EXISTS guild_roller_channels" in sql
    assert "INFORMATION_SCHEMA.COLUMNS" in sql
    assert "ALTER TABLE guild_roller_channels ADD COLUMN dm_result" in sql


def test_create_legacy_private_voice_table_preserves_existing_schema():
    from utils.migrations import create_legacy_private_voice_table

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value

    create_legacy_private_voice_table(connection)

    sql = " ".join(call.args[0] for call in cursor.execute.call_args_list)
    assert "CREATE TABLE IF NOT EXISTS private_voice_channels" in sql
    assert "id INT AUTO_INCREMENT PRIMARY KEY" in sql
    assert "guild_id BIGINT NOT NULL" in sql
    assert "channel_id BIGINT NOT NULL" in sql
    assert "owner_id BIGINT NOT NULL" in sql
    assert "config_json JSON" in sql
    assert "created_at DATETIME DEFAULT CURRENT_TIMESTAMP" in sql
    assert "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" in sql
    assert "UNIQUE" not in sql.upper()


def test_default_migrations_register_tables_in_version_order():
    from utils.migrations import (
        DEFAULT_MIGRATIONS,
        create_legacy_private_voice_table,
        create_log_channel_table,
        create_roller_channel_table,
        migrate_private_voice_table,
        create_self_role_table,
        create_activity_stats_table,
        create_guild_metadata_table,
    )

    assert [(migration.version, migration.apply) for migration in DEFAULT_MIGRATIONS] == [
        ("001", create_log_channel_table),
        ("002", create_roller_channel_table),
        ("003", create_legacy_private_voice_table),
        ("004", migrate_private_voice_table),
        ("005", create_self_role_table),
        ("006", create_activity_stats_table),
        ("007", create_guild_metadata_table),
    ]


class FakeMySqlError(Exception):
    pass


def test_migrate_private_voice_table_normalizes_schema_in_order():
    from utils.migrations import migrate_private_voice_table

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []

    migrate_private_voice_table(connection)

    statements = [item.args[0] for item in cursor.execute.call_args_list]
    assert "CREATE TABLE IF NOT EXISTS private_voice_channels" in statements[0]
    assert "config_type VARCHAR(16) NOT NULL DEFAULT 'private'" in statements[0]
    assert "trigger_guild_id BIGINT NULL" in statements[0]
    assert statements[1].startswith("ALTER TABLE private_voice_channels ADD COLUMN config_type")
    assert statements[2].startswith("ALTER TABLE private_voice_channels ADD COLUMN trigger_guild_id")
    assert statements[3].startswith("UPDATE private_voice_channels SET")
    assert "trigger_guild_id=CASE" in statements[3]
    assert statements[3].endswith("updated_at=updated_at")
    assert statements[4] == (
        "SELECT id, guild_id, channel_id, config_type FROM private_voice_channels "
        "ORDER BY updated_at DESC, id DESC"
    )
    assert "uq_private_voice_channel" in statements[5]
    assert "uq_private_voice_trigger_guild" in statements[6]


def test_migrate_private_voice_table_ignores_existing_columns_error_1060():
    from utils.migrations import migrate_private_voice_table

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []

    def execute(sql, params=None):
        if "ADD COLUMN" in sql:
            raise FakeMySqlError(1060, "Duplicate column")

    cursor.execute.side_effect = execute

    migrate_private_voice_table(connection)

    executed_sql = [item.args[0] for item in cursor.execute.call_args_list]
    assert "UPDATE private_voice_channels SET" in executed_sql[3]
    assert "uq_private_voice_channel" in executed_sql[-2]
    assert "uq_private_voice_trigger_guild" in executed_sql[-1]


def test_migrate_private_voice_table_ignores_existing_unique_keys_error_1061():
    from utils.migrations import migrate_private_voice_table

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []

    def execute(sql, params=None):
        if "ADD UNIQUE KEY" in sql:
            raise FakeMySqlError(1061, "Duplicate key name")

    cursor.execute.side_effect = execute

    migrate_private_voice_table(connection)

    unique_attempts = [
        item.args[0]
        for item in cursor.execute.call_args_list
        if "ADD UNIQUE KEY" in item.args[0]
    ]
    assert len(unique_attempts) == 2


@pytest.mark.parametrize("target", ["ADD COLUMN config_type", "ADD UNIQUE KEY"])
def test_migrate_private_voice_table_reraises_other_database_errors(target):
    from utils.migrations import migrate_private_voice_table

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []
    error = FakeMySqlError(1205, "Lock wait timeout")

    def execute(sql, params=None):
        if target in sql:
            raise error

    cursor.execute.side_effect = execute

    with pytest.raises(FakeMySqlError) as raised:
        migrate_private_voice_table(connection)

    assert raised.value is error


def test_migrate_private_voice_table_deletes_duplicate_rows_with_parameters():
    from utils.migrations import migrate_private_voice_table

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = [
        (5, 1, 10, "trigger"),
        (4, 1, 11, "trigger"),
        (3, 2, 10, "private"),
        (2, 2, 12, "private"),
        (1, 3, 13, "trigger"),
    ]

    migrate_private_voice_table(connection)

    cursor.execute.assert_any_call(
        "DELETE FROM private_voice_channels WHERE id IN (%s,%s)",
        [4, 3],
    )


def test_migrate_private_voice_table_only_marks_triggers_that_are_kept():
    from utils.migrations import migrate_private_voice_table

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = [
        (10, 1, 100, "private"),
        (9, 2, 100, "private"),
        (8, 10, 100, "trigger"),
        (7, 10, 101, "trigger"),
    ]

    migrate_private_voice_table(connection)

    cursor.execute.assert_any_call(
        "DELETE FROM private_voice_channels WHERE id IN (%s,%s)",
        [9, 8],
    )
