"""
Shared base utilities for the unified server logger.

Provides:
- Database connection & log-channel CRUD
- Common embed builder helpers
- Logger instance
"""

import discord
import json
import os
from datetime import datetime
from typing import Optional

from command.language_manager import get_translation
import uilts.logger as log_helper
from uilts.database import get_db_conn


# ---------------------------------------------------------------------------
# Log-channel table
# ---------------------------------------------------------------------------

def init_log_channel_table() -> None:
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS guild_log_channels (
                    guild_id BIGINT PRIMARY KEY,
                    channel_id BIGINT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            ''')
        conn.commit()
    finally:
        conn.close()


# Initialise on module load
init_log_channel_table()

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------

logger = log_helper.setup_logger(__name__, level=log_helper.logging.INFO)


# ---------------------------------------------------------------------------
# Log-channel persistence
# ---------------------------------------------------------------------------

def set_log_channel(guild_id: int, channel_id: int) -> None:
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            sql = (
                "INSERT INTO guild_log_channels (guild_id, channel_id) "
                "VALUES (%s, %s) ON DUPLICATE KEY UPDATE channel_id=%s"
            )
            cursor.execute(sql, (guild_id, channel_id, channel_id))
        conn.commit()
    finally:
        conn.close()


def get_log_channel(guild_id: int) -> Optional[int]:
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT channel_id FROM guild_log_channels WHERE guild_id=%s",
                (guild_id,),
            )
            result = cursor.fetchone()
            return result[0] if result else None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Embed helpers
# ---------------------------------------------------------------------------

def _safe_field_value(text: str, max_len: int = 1024) -> str:
    """Truncate text so it fits in an embed field value."""
    if not text:
        return ""
    if len(text) > max_len:
        return text[: max_len - 3] + "..."
    return text


def _channel_mention(
    channel: Optional[discord.abc.GuildChannel], guild_id: int
) -> str:
    """Return a channel mention or translated fallback."""
    if isinstance(
        channel,
        (
            discord.TextChannel,
            discord.VoiceChannel,
            discord.StageChannel,
            discord.Thread,
            discord.ForumChannel,
        ),
    ):
        return channel.mention
    if channel is not None:
        return f"`#{channel.name}`"
    return get_translation("unknown_channel", guild_id)


async def _send_log_embed(
    guild: discord.Guild,
    embed: discord.Embed,
    *,
    sender_name: str = "server_logger",
) -> bool:
    """Send *embed* to the configured log channel of *guild*.

    Returns ``True`` on success, ``False`` otherwise.
    """
    log_channel_id = get_log_channel(guild.id)
    if not log_channel_id:
        return False

    channel = guild.get_channel(log_channel_id)
    if channel is None or not isinstance(channel, discord.abc.Messageable):
        return False

    try:
        await channel.send(embed=embed)
        return True
    except discord.Forbidden:
        logger.warning(
            "Missing permission to send %s log to channel %s in guild %s",
            sender_name,
            log_channel_id,
            guild.id,
        )
    except Exception:
        logger.exception("Failed to send %s log", sender_name)
    return False


def _set_author(embed: discord.Embed, member: discord.Member | discord.User) -> None:
    """Set embed author field from a member/user."""
    embed.set_author(
        name=member.display_name,
        icon_url=member.avatar.url if member.avatar else None,
    )


def _set_footer_id(embed: discord.Embed, member: discord.Member | discord.User) -> None:
    embed.set_footer(text=f"User ID: {member.id}")


def _now() -> datetime:
    return datetime.now()
