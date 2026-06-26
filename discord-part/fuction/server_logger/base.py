"""
Shared base utilities for the unified server logger.

Provides:
- Database connection & log-channel CRUD
- Common embed builder helpers
- Logger instance
- LogBatcher: buffers log embeds per guild for 10s, then sends combined
"""

import asyncio
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


# ---------------------------------------------------------------------------
# Log batching – buffer embeds per guild for 10 s, then send combined
# ---------------------------------------------------------------------------

BATCH_INTERVAL = 10.0          # seconds to wait before flushing
MAX_EMBEDS_PER_MESSAGE = 10    # Discord limit per message


class LogBatcher:
    """Buffers log embeds per guild and sends them combined every
    ``BATCH_INTERVAL`` seconds."""

    def __init__(self, interval: float = BATCH_INTERVAL) -> None:
        self._interval = interval
        # guild_id → (guild, [embeds])
        self._buffers: dict[int, tuple[discord.Guild, list[discord.Embed]]] = {}
        self._tasks: dict[int, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    # -- public API --------------------------------------------------------

    async def enqueue(
        self, guild: discord.Guild, embed: discord.Embed
    ) -> None:
        """Add *embed* to the buffer for *guild*.

        A flush task is scheduled automatically when the first embed
        for a guild is queued.
        """
        async with self._lock:
            if guild.id in self._buffers:
                self._buffers[guild.id][1].append(embed)
            else:
                self._buffers[guild.id] = (guild, [embed])
                self._tasks[guild.id] = asyncio.create_task(
                    self._flush_after_delay(guild)
                )

    async def flush_all(self) -> None:
        """Immediately flush every guild that has pending embeds.

        Useful during bot shutdown to avoid losing buffered logs.
        """
        async with self._lock:
            # Cancel all pending timers
            for task in self._tasks.values():
                task.cancel()
            self._tasks.clear()

            # Snapshot buffers
            snapshot = list(self._buffers.values())
            self._buffers.clear()

        # Flush outside the lock
        for guild, embeds in snapshot:
            await self._send_embeds(guild, embeds)

    # -- internals ---------------------------------------------------------

    async def _flush_after_delay(self, guild: discord.Guild) -> None:
        """Sleep for the batch interval, then flush."""
        try:
            await asyncio.sleep(self._interval)
        except asyncio.CancelledError:
            return
        await self._flush_now(guild)

    async def _flush_now(self, guild: discord.Guild) -> None:
        """Send all buffered embeds for *guild* in one or more
        combined messages."""
        async with self._lock:
            entry = self._buffers.pop(guild.id, None)
            self._tasks.pop(guild.id, None)

        if entry is None:
            return

        _stored_guild, embeds = entry
        await self._send_embeds(guild, embeds)

    @staticmethod
    async def _send_embeds(
        guild: discord.Guild, embeds: list[discord.Embed]
    ) -> None:
        """Actually transmit *embeds* to the configured log channel."""
        if not embeds:
            return

        log_channel_id = get_log_channel(guild.id)
        if not log_channel_id:
            return

        channel = guild.get_channel(log_channel_id)
        if channel is None or not isinstance(channel, discord.abc.Messageable):
            return

        # Discord allows at most 10 embeds per message – chunk if needed
        for i in range(0, len(embeds), MAX_EMBEDS_PER_MESSAGE):
            chunk = embeds[i : i + MAX_EMBEDS_PER_MESSAGE]
            try:
                await channel.send(embeds=chunk)
            except discord.Forbidden:
                logger.warning(
                    "Missing permission to send batched logs "
                    "to channel %s in guild %s",
                    log_channel_id,
                    guild.id,
                )
                break
            except Exception:
                logger.exception("Failed to send batched logs")


# Module-level singleton – shared by all event handlers
_batcher = LogBatcher()


async def _send_log_embed(
    guild: discord.Guild,
    embed: discord.Embed,
    *,
    sender_name: str = "server_logger",
) -> bool:
    """Enqueue *embed* for batched delivery to the log channel of *guild*.

    The embed will be sent together with other buffered embeds after a
    short delay (see ``BATCH_INTERVAL``).

    Returns ``True`` if the log channel is configured, ``False`` otherwise.
    """
    log_channel_id = get_log_channel(guild.id)
    if not log_channel_id:
        return False

    channel = guild.get_channel(log_channel_id)
    if channel is None or not isinstance(channel, discord.abc.Messageable):
        return False

    await _batcher.enqueue(guild, embed)
    return True


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
