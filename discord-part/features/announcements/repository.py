"""Persistence operations for scheduled Discord announcements."""

from utils.database import get_db_conn


class AnnouncementRepository:
    def __init__(self, connection_factory=get_db_conn):
        self._connection_factory = connection_factory

    def recover_claims(self) -> None:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE website_announcements SET status='scheduled' "
                    "WHERE status='sending'"
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def claim_due(self, limit: int = 20) -> list[dict]:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id, guild_id, channel_id, content FROM website_announcements "
                    "WHERE status='scheduled' AND scheduled_at <= UTC_TIMESTAMP() "
                    "ORDER BY scheduled_at, id LIMIT %s FOR UPDATE",
                    (max(1, min(int(limit), 100)),),
                )
                rows = cursor.fetchall()
                claimed = []
                for row in rows:
                    announcement = dict(zip(("id", "guild_id", "channel_id", "content"), row))
                    cursor.execute(
                        "UPDATE website_announcements SET status='sending' "
                        "WHERE id=%s AND status='scheduled'",
                        (announcement["id"],),
                    )
                    if cursor.rowcount:
                        claimed.append(announcement)
            conn.commit()
            return claimed
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def mark_sent(self, announcement_id: int) -> None:
        self._set_status(announcement_id, "sent")

    def release(self, announcement_id: int) -> None:
        self._set_status(announcement_id, "scheduled")

    def _set_status(self, announcement_id: int, status: str) -> None:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE website_announcements SET status=%s "
                    "WHERE id=%s AND status='sending'",
                    (status, int(announcement_id)),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
