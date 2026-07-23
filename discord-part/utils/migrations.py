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


DEFAULT_MIGRATIONS = (
    Migration("001", "create guild_log_channels table", create_log_channel_table),
    Migration("002", "create guild_roller_channels table", create_roller_channel_table),
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
