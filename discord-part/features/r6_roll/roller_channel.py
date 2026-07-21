import json
import os
from typing import Optional

from utils.database import get_db_conn as _get_db_conn


def init_roller_channel_table() -> None:
    conn = _get_db_conn()
    try:
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

            # Backward compatible migration: add dm_result column if the table existed before.
            cursor.execute(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='guild_roller_channels' AND COLUMN_NAME='dm_result'"
            )
            has_col = cursor.fetchone()[0]
            if not has_col:
                cursor.execute("ALTER TABLE guild_roller_channels ADD COLUMN dm_result TINYINT NOT NULL DEFAULT 1")
        conn.commit()
    finally:
        conn.close()


# Initialize table on module load
init_roller_channel_table()


def set_roller_channel(guild_id: int, channel_id: int, dm_result: bool = True) -> None:
    conn = _get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO guild_roller_channels (guild_id, channel_id, dm_result) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE channel_id=%s, dm_result=%s",
                (guild_id, channel_id, 1 if dm_result else 0, channel_id, 1 if dm_result else 0),
            )
        conn.commit()
    finally:
        conn.close()


def get_roller_channel(guild_id: int) -> Optional[int]:
    conn = _get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT channel_id FROM guild_roller_channels WHERE guild_id=%s", (guild_id,))
            row = cursor.fetchone()
            return int(row[0]) if row else None
    finally:
        conn.close()


def get_roller_dm_result(guild_id: int) -> bool:
    """Return True if roller results should be sent via DM for this guild."""
    conn = _get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT dm_result FROM guild_roller_channels WHERE guild_id=%s", (guild_id,))
            row = cursor.fetchone()
            if not row:
                return True
            return bool(int(row[0]))
    finally:
        conn.close()


def set_roller_dm_result(guild_id: int, dm_result: bool) -> bool:
    """Update dm_result mode. Returns False if no roller channel is configured yet."""
    conn = _get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT channel_id FROM guild_roller_channels WHERE guild_id=%s", (guild_id,))
            row = cursor.fetchone()
            if not row:
                return False

            cursor.execute(
                "UPDATE guild_roller_channels SET dm_result=%s WHERE guild_id=%s",
                (1 if dm_result else 0, guild_id),
            )
        conn.commit()
        return True
    finally:
        conn.close()
