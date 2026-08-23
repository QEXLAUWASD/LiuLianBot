"""
Guild-related log events (bot join, bot leave, guild update).
"""

import discord

from .base import (
    _safe_field_value,
    _send_log_embed,
    _now,
    logger,
    get_audit_actor,
    add_audit_actor_field,
)
from commands.language_manager import get_translation


async def on_guild_join(guild: discord.Guild) -> None:
    """Log when the bot joins a new server."""
    # When joining a new guild we may not have a log channel set yet,
    # but we can still log to console / file.
    owner = guild.owner
    owner_text = f"{owner.mention} ({owner.name})" if owner else "N/A"

    embed = discord.Embed(
        title=get_translation("guild_join_title", guild.id),
        color=discord.Color.green(),
        timestamp=_now(),
    )
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)

    embed.add_field(
        name=get_translation("guild_join_name", guild.id),
        value=guild.name,
        inline=True,
    )
    embed.add_field(
        name=get_translation("guild_join_id", guild.id),
        value=str(guild.id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("guild_join_owner", guild.id),
        value=owner_text,
        inline=True,
    )
    embed.add_field(
        name=get_translation("guild_join_members", guild.id),
        value=str(guild.member_count),
        inline=True,
    )
    embed.set_footer(text=f"Guild ID: {guild.id}")

    # Try to send to log channel (may not be configured yet)
    await _send_log_embed(guild, embed, sender_name="guild_join")

    # Also log to console
    logger.info("Joined guild: %s (ID: %s, Members: %s)", guild.name, guild.id, guild.member_count)


async def on_guild_remove(guild: discord.Guild) -> None:
    """Log when the bot leaves or is removed from a server."""
    embed = discord.Embed(
        title=get_translation("guild_leave_title", guild.id),
        color=discord.Color.red(),
        timestamp=_now(),
    )
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)

    embed.add_field(
        name=get_translation("guild_leave_name", guild.id),
        value=guild.name,
        inline=True,
    )
    embed.add_field(
        name=get_translation("guild_leave_id", guild.id),
        value=str(guild.id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("guild_leave_members", guild.id),
        value=str(guild.member_count),
        inline=True,
    )
    embed.set_footer(text=f"Guild ID: {guild.id}")

    await _send_log_embed(guild, embed, sender_name="guild_leave")
    logger.info("Left guild: %s (ID: %s)", guild.name, guild.id)


async def on_guild_update(before: discord.Guild, after: discord.Guild) -> None:
    """Log guild setting changes (name, owner, icon, etc.)."""
    guild_id = after.id
    changes: list[str] = []

    if before.name != after.name:
        changes.append(
            get_translation("guild_update_name", guild_id)
            .replace("{old}", before.name)
            .replace("{new}", after.name)
        )
    if before.owner_id != after.owner_id:
        changes.append(
            get_translation("guild_update_owner", guild_id)
            .replace("{old}", f"<@{before.owner_id}>")
            .replace("{new}", f"<@{after.owner_id}>")
        )
    if before.afk_channel != after.afk_channel:
        changes.append(
            get_translation("guild_update_afk_channel", guild_id)
            .replace("{old}", before.afk_channel.name if before.afk_channel else "None")
            .replace("{new}", after.afk_channel.name if after.afk_channel else "None")
        )
    if before.verification_level != after.verification_level:
        changes.append(
            get_translation("guild_update_verification", guild_id)
            .replace("{old}", str(before.verification_level))
            .replace("{new}", str(after.verification_level))
        )
    for attr, translation_key in (
        ("default_notifications", "guild_update_notifications"),
        ("explicit_content_filter", "guild_update_content_filter"),
        ("preferred_locale", "guild_update_locale"),
        ("description", "guild_update_description"),
        ("widget_enabled", "guild_update_widget"),
    ):
        old_value = getattr(before, attr, None)
        new_value = getattr(after, attr, None)
        if old_value != new_value:
            changes.append(
                get_translation(translation_key, guild_id)
                .replace("{old}", str(old_value))
                .replace("{new}", str(new_value))
            )

    for attr, translation_key in (
        ("system_channel", "guild_update_system_channel"),
        ("rules_channel", "guild_update_rules_channel"),
        ("public_updates_channel", "guild_update_public_updates_channel"),
    ):
        old_channel = getattr(before, attr, None)
        new_channel = getattr(after, attr, None)
        if getattr(old_channel, "id", None) != getattr(new_channel, "id", None):
            changes.append(
                get_translation(translation_key, guild_id)
                .replace("{old}", old_channel.name if old_channel else "None")
                .replace("{new}", new_channel.name if new_channel else "None")
            )

    if not changes:
        return

    embed = discord.Embed(
        title=get_translation("guild_update_title", guild_id),
        color=discord.Color.blue(),
        timestamp=_now(),
    )
    if after.icon:
        embed.set_thumbnail(url=after.icon.url)

    embed.add_field(
        name=get_translation("guild_update_name_field", guild_id),
        value=after.name,
        inline=True,
    )
    embed.add_field(
        name=get_translation("guild_update_changes", guild_id),
        value=_safe_field_value("\n".join(changes)),
        inline=False,
    )
    embed.set_footer(text=f"Guild ID: {after.id}")

    actor = await get_audit_actor(after, discord.AuditLogAction.guild_update, guild_id)
    add_audit_actor_field(embed, actor, guild_id)

    await _send_log_embed(after, embed, sender_name="guild_update")
