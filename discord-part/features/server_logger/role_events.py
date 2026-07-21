"""
Role-related log events (create, delete, update).
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
from commands.language_manager import get_translation


async def on_guild_role_create(role: discord.Role) -> None:
    """Log when a role is created."""
    guild = role.guild
    guild_id = guild.id

    embed = discord.Embed(
        title=get_translation("role_create_title", guild_id),
        color=discord.Color.green(),
        timestamp=_now(),
    )
    embed.add_field(
        name=get_translation("role_create_name", guild_id),
        value=role.mention,
        inline=True,
    )
    embed.add_field(
        name=get_translation("role_create_id", guild_id),
        value=str(role.id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("role_create_color", guild_id),
        value=str(role.color) if role.color.value else "Default",
        inline=True,
    )
    embed.add_field(
        name=get_translation("role_create_hoist", guild_id),
        value=str(role.hoist),
        inline=True,
    )
    embed.add_field(
        name=get_translation("role_create_mentionable", guild_id),
        value=str(role.mentionable),
        inline=True,
    )
    embed.set_footer(text=f"Role ID: {role.id}  |  Guild ID: {guild_id}")

    await _send_log_embed(guild, embed, sender_name="role_create")


async def on_guild_role_delete(role: discord.Role) -> None:
    """Log when a role is deleted."""
    guild = role.guild
    guild_id = guild.id

    embed = discord.Embed(
        title=get_translation("role_delete_title", guild_id),
        color=discord.Color.red(),
        timestamp=_now(),
    )
    embed.add_field(
        name=get_translation("role_delete_name", guild_id),
        value=f"@{role.name}",
        inline=True,
    )
    embed.add_field(
        name=get_translation("role_delete_id", guild_id),
        value=str(role.id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("role_delete_color", guild_id),
        value=str(role.color) if role.color.value else "Default",
        inline=True,
    )
    embed.set_footer(text=f"Role ID: {role.id}  |  Guild ID: {guild_id}")

    await _send_log_embed(guild, embed, sender_name="role_delete")


async def on_guild_role_update(before: discord.Role, after: discord.Role) -> None:
    """Log when a role's settings are changed."""
    guild = after.guild
    guild_id = guild.id
    changes: list[str] = []

    if before.name != after.name:
        changes.append(
            get_translation("role_update_name", guild_id)
            .replace("{old}", before.name)
            .replace("{new}", after.name)
        )
    if before.color != after.color:
        changes.append(
            get_translation("role_update_color", guild_id)
            .replace("{old}", str(before.color))
            .replace("{new}", str(after.color))
        )
    if before.hoist != after.hoist:
        changes.append(
            get_translation("role_update_hoist", guild_id)
            .replace("{old}", str(before.hoist))
            .replace("{new}", str(after.hoist))
        )
    if before.mentionable != after.mentionable:
        changes.append(
            get_translation("role_update_mentionable", guild_id)
            .replace("{old}", str(before.mentionable))
            .replace("{new}", str(after.mentionable))
        )
    if before.permissions != after.permissions:
        changes.append(get_translation("role_update_permissions", guild_id))

    if not changes:
        return

    embed = discord.Embed(
        title=get_translation("role_update_title", guild_id),
        color=discord.Color.blue(),
        timestamp=_now(),
    )
    embed.add_field(
        name=get_translation("role_update_name_field", guild_id),
        value=after.mention,
        inline=True,
    )
    embed.add_field(
        name=get_translation("role_update_id", guild_id),
        value=str(after.id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("role_update_changes", guild_id),
        value=_safe_field_value("\n".join(changes)),
        inline=False,
    )
    embed.set_footer(text=f"Role ID: {after.id}  |  Guild ID: {guild_id}")

    await _send_log_embed(guild, embed, sender_name="role_update")
