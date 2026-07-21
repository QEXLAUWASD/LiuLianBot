"""
Channel-related log events (create, delete, update).
"""

import discord
from datetime import datetime
from typing import Optional

from .base import (
    _safe_field_value,
    _send_log_embed,
    _now,
    logger,
)
from command.language_manager import get_translation


_CHANNEL_TYPE_MAP = {
    discord.ChannelType.text: "channel_type_text",
    discord.ChannelType.voice: "channel_type_voice",
    discord.ChannelType.category: "channel_type_category",
    discord.ChannelType.stage_voice: "channel_type_stage",
    discord.ChannelType.forum: "channel_type_forum",
    discord.ChannelType.news: "channel_type_announcement",
}


def _channel_type_key(channel: discord.abc.GuildChannel) -> str:
    return _CHANNEL_TYPE_MAP.get(channel.type, "channel_type_unknown")


async def on_guild_channel_create(channel: discord.abc.GuildChannel) -> None:
    """Log when a channel is created."""
    guild = channel.guild
    guild_id = guild.id

    type_key = _channel_type_key(channel)

    embed = discord.Embed(
        title=get_translation("channel_create_title", guild_id),
        color=discord.Color.green(),
        timestamp=_now(),
    )
    embed.add_field(
        name=get_translation("channel_create_name", guild_id),
        value=f"#{channel.name}",
        inline=True,
    )
    embed.add_field(
        name=get_translation("channel_create_type", guild_id),
        value=get_translation(type_key, guild_id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("channel_create_id", guild_id),
        value=str(channel.id),
        inline=True,
    )

    if hasattr(channel, "category") and channel.category:
        embed.add_field(
            name=get_translation("channel_create_category", guild_id),
            value=channel.category.name,
            inline=True,
        )
    if isinstance(channel, discord.TextChannel) and channel.topic:
        embed.add_field(
            name=get_translation("channel_create_topic", guild_id),
            value=_safe_field_value(channel.topic, max_len=512),
            inline=False,
        )

    embed.set_footer(text=f"Channel ID: {channel.id}  |  Guild ID: {guild_id}")

    await _send_log_embed(guild, embed, sender_name="channel_create")


async def on_guild_channel_delete(channel: discord.abc.GuildChannel) -> None:
    """Log when a channel is deleted."""
    guild = channel.guild
    guild_id = guild.id

    type_key = _channel_type_key(channel)

    embed = discord.Embed(
        title=get_translation("channel_delete_title", guild_id),
        color=discord.Color.red(),
        timestamp=_now(),
    )
    embed.add_field(
        name=get_translation("channel_delete_name", guild_id),
        value=f"#{channel.name}",
        inline=True,
    )
    embed.add_field(
        name=get_translation("channel_delete_type", guild_id),
        value=get_translation(type_key, guild_id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("channel_delete_id", guild_id),
        value=str(channel.id),
        inline=True,
    )
    if hasattr(channel, "category") and channel.category:
        embed.add_field(
            name=get_translation("channel_delete_category", guild_id),
            value=channel.category.name,
            inline=True,
        )
    embed.set_footer(text=f"Channel ID: {channel.id}  |  Guild ID: {guild_id}")

    await _send_log_embed(guild, embed, sender_name="channel_delete")


async def on_guild_channel_update(
    before: discord.abc.GuildChannel, after: discord.abc.GuildChannel
) -> None:
    """Log when a channel's settings are changed."""
    guild = after.guild
    guild_id = guild.id
    changes: list[str] = []

    if before.name != after.name:
        changes.append(
            get_translation("channel_update_name", guild_id)
            .replace("{old}", before.name)
            .replace("{new}", after.name)
        )

    if isinstance(before, discord.TextChannel) and isinstance(after, discord.TextChannel):
        if before.topic != after.topic:
            changes.append(get_translation("channel_update_topic_changed", guild_id))
        if before.slowmode_delay != after.slowmode_delay:
            changes.append(
                get_translation("channel_update_slowmode", guild_id)
                .replace("{old}", str(before.slowmode_delay))
                .replace("{new}", str(after.slowmode_delay))
            )
        if before.nsfw != after.nsfw:
            changes.append(
                get_translation("channel_update_nsfw", guild_id)
                .replace("{old}", str(before.nsfw))
                .replace("{new}", str(after.nsfw))
            )

    if isinstance(before, discord.VoiceChannel) and isinstance(after, discord.VoiceChannel):
        if before.user_limit != after.user_limit:
            changes.append(
                get_translation("channel_update_user_limit", guild_id)
                .replace("{old}", str(before.user_limit))
                .replace("{new}", str(after.user_limit))
            )
        if before.bitrate != after.bitrate:
            changes.append(
                get_translation("channel_update_bitrate", guild_id)
                .replace("{old}", str(before.bitrate // 1000))
                .replace("{new}", str(after.bitrate // 1000))
            )

    # Category change
    if hasattr(before, "category_id") and hasattr(after, "category_id"):
        if before.category_id != after.category_id:
            old_cat = before.category.name if before.category else "None"
            new_cat = after.category.name if after.category else "None"
            changes.append(
                get_translation("channel_update_category", guild_id)
                .replace("{old}", old_cat)
                .replace("{new}", new_cat)
            )

    # Permission overwrite changes
    if before.overwrites != after.overwrites:
        changes.append(get_translation("channel_update_permissions", guild_id))

    if not changes:
        return

    type_key = _channel_type_key(after)

    embed = discord.Embed(
        title=get_translation("channel_update_title", guild_id),
        color=discord.Color.blue(),
        timestamp=_now(),
    )
    embed.add_field(
        name=get_translation("channel_update_name_field", guild_id),
        value=f"#{after.name}",
        inline=True,
    )
    embed.add_field(
        name=get_translation("channel_update_type", guild_id),
        value=get_translation(type_key, guild_id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("channel_update_changes", guild_id),
        value=_safe_field_value("\n".join(changes)),
        inline=False,
    )
    embed.set_footer(text=f"Channel ID: {after.id}  |  Guild ID: {guild_id}")

    await _send_log_embed(guild, embed, sender_name="channel_update")
