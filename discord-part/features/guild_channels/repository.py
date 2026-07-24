from utils.database import get_db_conn


class GuildChannelRepository:
    def __init__(self, connection_factory=get_db_conn):
        self._connection_factory = connection_factory

    def replace_for_guild(self, guild_id: int, channels: list[tuple[int, str]]) -> None:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM discord_guild_channels WHERE guild_id=%s", (int(guild_id),))
                if channels:
                    cursor.executemany(
                        "INSERT INTO discord_guild_channels (guild_id, channel_id, channel_name) "
                        "VALUES (%s, %s, %s)",
                        [(int(guild_id), int(channel_id), str(name)[:100]) for channel_id, name in channels],
                    )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
