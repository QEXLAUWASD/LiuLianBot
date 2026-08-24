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
from datetime import datetime, timedelta
from typing import Optional
from types import SimpleNamespace

from commands.language_manager import get_translation
import utils.logger as log_helper
from utils.database import get_db_conn
from utils.async_io import run_blocking


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
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS guild_log_channel_settings (
                    guild_id BIGINT NOT NULL,
                    log_type VARCHAR(30) NOT NULL,
                    channel_id BIGINT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, log_type)
                )
            ''')
        conn.commit()
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------

logger = log_helper.setup_logger(__name__, level=log_helper.logging.INFO)


async def get_audit_actor(
    guild: discord.Guild,
    action: (
        discord.AuditLogAction
        | str
        | int
        | tuple[discord.AuditLogAction | str | int, ...]
    ),
    target_id: int,
    *,
    max_age_seconds: int = 30,
    retries: int = 6,
    retry_delay_seconds: float = 1.0,
) -> Optional[discord.User]:
    """Return the user responsible for a recent audit-log action.

    Discord events do not include the actor. Audit logs can arrive slightly
    after the gateway event, so callers should use this best-effort lookup.
    """
    actions = action if isinstance(action, tuple) else (action,)
    resolved_actions: list[object] = []
    for original_action in actions:
        audit_action = original_action
        if isinstance(audit_action, str):
            try:
                audit_action = discord.AuditLogAction[audit_action]
            except KeyError:
                try:
                    audit_action = int(audit_action)
                except ValueError:
                    audit_action = None

        audit_action_value = getattr(audit_action, "value", audit_action)
        if isinstance(audit_action_value, bool):
            audit_action_value = None
        elif isinstance(audit_action_value, int):
            pass
        else:
            try:
                audit_action_value = int(audit_action_value)
            except (TypeError, ValueError):
                audit_action_value = None

        if audit_action_value is None or audit_action_value < 0:
            logger.warning(
                "Ignoring invalid audit-log action %r for guild %s",
                original_action,
                guild.id,
            )
            return None

        if isinstance(audit_action, discord.AuditLogAction):
            resolved_actions.append(audit_action)
            continue

        try:
            resolved_actions.append(discord.AuditLogAction(audit_action_value))
        except (TypeError, ValueError):
            # Older discord.py releases may not know newer Discord actions,
            # but audit_logs only requires an object exposing ``value``.
            resolved_actions.append(SimpleNamespace(value=audit_action_value))

    for attempt in range(max(1, retries)):
        cutoff = _now() - timedelta(seconds=max_age_seconds)
        try:
            for audit_action in resolved_actions:
                async for entry in guild.audit_logs(limit=50, action=audit_action):
                    if entry.created_at < cutoff:
                        break
                    target = entry.target
                    if getattr(target, "id", None) == target_id:
                        return entry.user
        except (discord.Forbidden, discord.HTTPException):
            logger.debug("Unable to read audit log for guild %s", guild.id, exc_info=True)
            return None
        except Exception:
            logger.warning("Unexpected audit-log lookup failure for guild %s", guild.id, exc_info=True)
            return None

        if attempt + 1 < max(1, retries):
            await asyncio.sleep(retry_delay_seconds)
    return None


def add_audit_actor_field(
    embed: discord.Embed, actor: Optional[discord.User], guild_id: int
) -> None:
    """Add a consistent actor field to moderation/configuration logs."""
    if actor is None:
        value = get_translation("audit_actor_unknown", guild_id)
    else:
        value = f"{actor.mention} ({actor})\nID: {actor.id}"
    embed.add_field(name=get_translation("audit_actor", guild_id), value=value, inline=False)


# ---------------------------------------------------------------------------
# Log-channel persistence
# ---------------------------------------------------------------------------

LOG_TYPES = {"all", "useraction", "voiceaction", "groupaction", "messageaction", "channelaction", "roleaction"}

def set_log_channel(guild_id: int, channel_id: int, log_type: str = "all") -> None:
    if log_type not in LOG_TYPES:
        raise ValueError(f"Unsupported log type: {log_type}")
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            sql = (
                "INSERT INTO guild_log_channels (guild_id, channel_id) "
                "VALUES (%s, %s) ON DUPLICATE KEY UPDATE channel_id=%s"
            )
            if log_type == "all":
                cursor.execute(sql, (guild_id, channel_id, channel_id))
                cursor.execute("DELETE FROM guild_log_channel_settings WHERE guild_id=%s", (guild_id,))
            else:
                cursor.execute("INSERT INTO guild_log_channel_settings (guild_id, log_type, channel_id) VALUES (%s, %s, %s) ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id)", (guild_id, log_type, channel_id))
        conn.commit()
    finally:
        conn.close()


def get_log_channel(guild_id: int, log_type: str = "all") -> Optional[int]:
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            if log_type != "all":
                cursor.execute("SELECT channel_id FROM guild_log_channel_settings WHERE guild_id=%s AND log_type=%s", (guild_id, log_type))
                result = cursor.fetchone()
                if result:
                    return result[0]
            cursor.execute("SELECT channel_id FROM guild_log_channels WHERE guild_id=%s", (guild_id,))
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
        self._buffers: dict[tuple[int, int], tuple[discord.Guild, int, list[discord.Embed]]] = {}
        self._tasks: dict[tuple[int, int], asyncio.Task] = {}
        self._lock = asyncio.Lock()

    # -- public API --------------------------------------------------------

    async def enqueue(
        self, guild: discord.Guild, channel_id: int, embed: discord.Embed
    ) -> None:
        """Add *embed* to the buffer for *guild*.

        A flush task is scheduled automatically when the first embed
        for a guild is queued.
        """
        async with self._lock:
            key = (guild.id, channel_id)
            if key in self._buffers:
                self._buffers[key][2].append(embed)
            else:
                self._buffers[key] = (guild, channel_id, [embed])
                self._tasks[key] = asyncio.create_task(
                    self._flush_after_delay(guild, channel_id)
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
        for guild, channel_id, embeds in snapshot:
            await self._send_embeds(guild, channel_id, embeds)

    # -- internals ---------------------------------------------------------

    async def _flush_after_delay(self, guild: discord.Guild, channel_id: int) -> None:
        """Sleep for the batch interval, then flush."""
        try:
            await asyncio.sleep(self._interval)
        except asyncio.CancelledError:
            return
        await self._flush_now(guild, channel_id)

    async def _flush_now(self, guild: discord.Guild, channel_id: int) -> None:
        """Send all buffered embeds for *guild* in one or more
        combined messages."""
        async with self._lock:
            key = (guild.id, channel_id)
            entry = self._buffers.pop(key, None)
            self._tasks.pop(key, None)

        if entry is None:
            return

        _stored_guild, _stored_channel_id, embeds = entry
        await self._send_embeds(guild, channel_id, embeds)

    @staticmethod
    async def _send_embeds(
        guild: discord.Guild, log_channel_id: int, embeds: list[discord.Embed]
    ) -> None:
        """Actually transmit *embeds* to the configured log channel."""
        if not embeds:
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
    log_type = {
        "voice_state": "voiceaction",
        "member_join": "useraction", "member_leave": "useraction", "member_update": "useraction", "member_ban": "useraction", "member_unban": "useraction",
        "guild_join": "groupaction", "guild_leave": "groupaction", "guild_update": "groupaction",
        "message_edit": "messageaction", "message_delete": "messageaction", "bulk_delete": "messageaction",
        "channel_create": "channelaction", "channel_delete": "channelaction", "channel_update": "channelaction",
        "role_create": "roleaction", "role_delete": "roleaction", "role_update": "roleaction",
    }.get(sender_name, "all")
    log_channel_id = await run_blocking(get_log_channel, guild.id, log_type)
    if not log_channel_id:
        return False

    channel = guild.get_channel(log_channel_id)
    if channel is None or not isinstance(channel, discord.abc.Messageable):
        return False

    await _batcher.enqueue(guild, log_channel_id, embed)
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
    return discord.utils.utcnow()
