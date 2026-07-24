from utils.database import get_db_conn


class GuildMetadataRepository:
    def __init__(self, connection_factory=get_db_conn):
        self._connection_factory = connection_factory

    def upsert(self, guild_id: int, guild_name: str):
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO discord_guild_metadata (guild_id, guild_name) VALUES (%s,%s) "
                    "ON DUPLICATE KEY UPDATE guild_name=VALUES(guild_name)",
                    (guild_id, str(guild_name)[:100]),
                )
            conn.commit()
        finally:
            conn.close()
