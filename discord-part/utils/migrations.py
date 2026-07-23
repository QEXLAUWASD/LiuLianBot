"""Database schema migrations for the Discord bot."""

from dataclasses import dataclass
from typing import Callable

from utils.database import get_db_conn


@dataclass(frozen=True)
class Migration:
    version: str
    name: str
    apply: Callable[[object], None]


def create_log_channel_table(conn) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS guild_log_channels (
                guild_id BIGINT PRIMARY KEY,
                channel_id BIGINT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
        )


def create_roller_channel_table(conn) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS guild_roller_channels (
                guild_id BIGINT PRIMARY KEY,
                channel_id BIGINT NOT NULL,
                dm_result TINYINT NOT NULL DEFAULT 1,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
        )
        cursor.execute(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_NAME = 'guild_roller_channels' "
            "AND COLUMN_NAME = 'dm_result'"
        )
        if not cursor.fetchone()[0]:
            cursor.execute(
                "ALTER TABLE guild_roller_channels "
                "ADD COLUMN dm_result TINYINT NOT NULL DEFAULT 1"
            )


def create_legacy_private_voice_table(conn) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS private_voice_channels (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id BIGINT NOT NULL,
                channel_id BIGINT NOT NULL,
                owner_id BIGINT NOT NULL,
                config_json JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
        )


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
            "ALTER TABLE private_voice_channels ADD COLUMN "
            "config_type VARCHAR(16) NOT NULL DEFAULT 'private'",
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
            "trigger_guild_id=CASE WHEN "
            "JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.type'))='trigger' "
            "THEN guild_id ELSE NULL END, updated_at=updated_at"
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
            duplicate = channel_id in seen_channels or (
                config_type == "trigger" and guild_id in seen_triggers
            )
            if duplicate:
                duplicate_ids.append(row_id)
            else:
                seen_channels.add(channel_id)
                if config_type == "trigger":
                    seen_triggers.add(guild_id)
        if duplicate_ids:
            placeholders = ",".join(["%s"] * len(duplicate_ids))
            cursor.execute(
                f"DELETE FROM private_voice_channels WHERE id IN ({placeholders})",
                duplicate_ids,
            )
        for statement in (
            "ALTER TABLE private_voice_channels ADD UNIQUE KEY "
            "uq_private_voice_channel (channel_id)",
            "ALTER TABLE private_voice_channels ADD UNIQUE KEY "
            "uq_private_voice_trigger_guild (trigger_guild_id)",
        ):
            try:
                cursor.execute(statement)
            except Exception as exc:
                if getattr(exc, "args", [None])[0] != 1061:
                    raise


DEFAULT_MIGRATIONS = (
    Migration("001", "create guild_log_channels table", create_log_channel_table),
    Migration("002", "create guild_roller_channels table", create_roller_channel_table),
    Migration(
        "003",
        "create legacy private_voice_channels table",
        create_legacy_private_voice_table,
    ),
    Migration("004", "normalize private voice persistence", migrate_private_voice_table),
)


def run_migrations(
    connection_factory=get_db_conn,
    migrations=DEFAULT_MIGRATIONS,
) -> None:
    conn = connection_factory()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(255) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute("SELECT version FROM schema_migrations")
            applied_versions = {row[0] for row in cursor.fetchall()}

        for migration in migrations:
            if migration.version in applied_versions:
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
