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


def test_default_migrations_register_tables_in_version_order():
    from utils.migrations import (
        DEFAULT_MIGRATIONS,
        create_log_channel_table,
        create_roller_channel_table,
    )

    assert [(migration.version, migration.apply) for migration in DEFAULT_MIGRATIONS] == [
        ("001", create_log_channel_table),
        ("002", create_roller_channel_table),
    ]
