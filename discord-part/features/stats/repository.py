from utils.database import get_db_conn


class StatsRepository:
    def __init__(self, connection_factory=get_db_conn):
        self._connection_factory = connection_factory

    def record_command(self, guild_id: int):
        if guild_id is None:
            return
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO guild_activity_stats (guild_id, day, command_count) VALUES (%s, UTC_DATE(), 1) "
                    "ON DUPLICATE KEY UPDATE command_count=command_count+1",
                    (guild_id,),
                )
            conn.commit()
        finally:
            conn.close()

    def record_voice_join(self, guild_id: int):
        if guild_id is None:
            return
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO guild_activity_stats (guild_id, day, voice_joins) VALUES (%s, UTC_DATE(), 1) "
                    "ON DUPLICATE KEY UPDATE voice_joins=voice_joins+1",
                    (guild_id,),
                )
            conn.commit()
        finally:
            conn.close()
