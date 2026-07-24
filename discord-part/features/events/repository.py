"""MySQL repository for website-created Discord events."""

from __future__ import annotations

import hashlib
from typing import Iterable

from utils.database import get_db_conn


def hash_link_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode("ascii")).hexdigest()


def build_balanced_teams(players: Iterable[str]) -> tuple[list[str], list[str]]:
    names = list(players)
    return names[::2], names[1::2]


class EventRepository:
    def __init__(self, connection_factory=get_db_conn):
        self._connection_factory = connection_factory

    def link_account(self, code: str, discord_user_id: int) -> bool:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id, user_id FROM website_link_codes "
                    "WHERE code_hash=%s AND used_at IS NULL AND expires_at > NOW() "
                    "ORDER BY id DESC LIMIT 1 FOR UPDATE",
                    (hash_link_code(code),),
                )
                row = cursor.fetchone()
                if not row:
                    return False
                code_id, user_id = row
                cursor.execute(
                    "SELECT id FROM website_users WHERE discord_user_id=%s",
                    (str(discord_user_id),),
                )
                existing = cursor.fetchone()
                if existing and existing[0] != user_id:
                    raise ValueError("already_linked")
                cursor.execute(
                    "UPDATE website_users SET discord_user_id=%s WHERE id=%s",
                    (str(discord_user_id), user_id),
                )
                cursor.execute(
                    "UPDATE website_link_codes SET used_at=NOW() WHERE id=%s",
                    (code_id,),
                )
            conn.commit()
            return True
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def list_events(self, guild_id: int) -> list[dict]:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT e.id, e.title, e.mode, e.start_at, e.max_players, "
                    "COUNT(ep.user_id) AS participant_count "
                    "FROM website_events e LEFT JOIN website_event_participants ep "
                    "ON ep.event_id=e.id WHERE e.guild_id=%s AND e.status='open' "
                    "AND e.start_at >= UTC_TIMESTAMP() GROUP BY e.id ORDER BY e.start_at LIMIT 10",
                    (guild_id,),
                )
                columns = ("id", "title", "mode", "start_at", "max_players", "participant_count")
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            conn.close()

    def _linked_user_id(self, cursor, discord_user_id: int):
        cursor.execute(
            "SELECT id FROM website_users WHERE discord_user_id=%s",
            (str(discord_user_id),),
        )
        row = cursor.fetchone()
        return row[0] if row else None

    def join_event(self, event_id: int, discord_user_id: int) -> str:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                user_id = self._linked_user_id(cursor, discord_user_id)
                if not user_id:
                    return "not_linked"
                cursor.execute(
                    "SELECT max_players, status FROM website_events WHERE id=%s FOR UPDATE",
                    (int(event_id),),
                )
                event = cursor.fetchone()
                if not event:
                    return "not_found"
                if event[1] != "open":
                    return "closed"
                cursor.execute(
                    "SELECT 1 FROM website_event_participants WHERE event_id=%s AND user_id=%s",
                    (int(event_id), user_id),
                )
                if cursor.fetchone():
                    return "joined"
                cursor.execute(
                    "SELECT COUNT(*) FROM website_event_participants WHERE event_id=%s",
                    (int(event_id),),
                )
                if cursor.fetchone()[0] >= event[0]:
                    return "full"
                cursor.execute(
                    "INSERT INTO website_event_participants (event_id, user_id) VALUES (%s, %s)",
                    (int(event_id), user_id),
                )
            conn.commit()
            return "joined"
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def leave_event(self, event_id: int, discord_user_id: int) -> str:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                user_id = self._linked_user_id(cursor, discord_user_id)
                if not user_id:
                    return "not_linked"
                cursor.execute(
                    "DELETE FROM website_event_participants WHERE event_id=%s AND user_id=%s",
                    (int(event_id), user_id),
                )
                removed = cursor.rowcount > 0
            conn.commit()
            return "left" if removed else "not_joined"
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def participants(self, event_id: int) -> list[str]:
        conn = self._connection_factory()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT u.username FROM website_event_participants ep "
                    "JOIN website_users u ON u.id=ep.user_id WHERE ep.event_id=%s "
                    "ORDER BY ep.joined_at, u.username",
                    (int(event_id),),
                )
                return [row[0] for row in cursor.fetchall()]
        finally:
            conn.close()
