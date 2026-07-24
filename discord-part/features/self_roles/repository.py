from utils.database import get_db_conn


class SelfRoleRepository:
    def __init__(self, connection_factory=get_db_conn):
        self._connection_factory = connection_factory

    def list_roles(self, guild_id: int):
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT role_id, role_name FROM guild_self_roles WHERE guild_id=%s ORDER BY role_name",
                    (guild_id,),
                )
                return cursor.fetchall()
        finally:
            conn.close()

    def add_role(self, guild_id: int, role_id: int, role_name: str):
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO guild_self_roles (guild_id, role_id, role_name) VALUES (%s,%s,%s) "
                    "ON DUPLICATE KEY UPDATE role_name=VALUES(role_name)",
                    (guild_id, role_id, role_name[:100]),
                )
            conn.commit()
        finally:
            conn.close()

    def remove_role(self, guild_id: int, role_id: int):
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM guild_self_roles WHERE guild_id=%s AND role_id=%s", (guild_id, role_id))
            conn.commit()
        finally:
            conn.close()
