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
        config_type = config.get("type", "private")
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE private_voice_channels SET config_json=%s, config_type=%s, "
                    "trigger_guild_id=CASE WHEN %s='trigger' THEN guild_id ELSE NULL END, "
                    "updated_at=NOW() "
                    "WHERE channel_id=%s",
                    (
                        json.dumps(config, ensure_ascii=False),
                        config_type,
                        config_type,
                        channel_id,
                    ),
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
                return {
                    int(guild_id): int(channel_id)
                    for guild_id, channel_id in cursor.fetchall()
                }
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
