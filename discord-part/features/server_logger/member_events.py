"""
Member-related log events (join, leave, update, ban, unban).
"""

import discord
from datetime import datetime
from typing import Optional

from .base import (
    _safe_field_value,
    _send_log_embed,
    _set_author,
    _set_footer_id,
    _now,
    logger,
)
from command.language_manager import get_translation


async def on_member_join(member: discord.Member) -> None:
    """Log when a member joins the server."""
    guild = member.guild
    if guild is None:
        return

    guild_id = guild.id

    created_ago = _format_timedelta(_now() - member.created_at) if member.created_at else "N/A"

    embed = discord.Embed(
        title=get_translation("member_join_title", guild_id),
        color=discord.Color.green(),
        timestamp=_now(),
    )
    _set_author(embed, member)

    embed.add_field(
        name=get_translation("member_join_user", guild_id),
        value=f"{member.mention} ({member.name})",
        inline=True,
    )
    embed.add_field(
        name=get_translation("member_join_created", guild_id),
        value=created_ago,
        inline=True,
    )
    embed.add_field(
        name=get_translation("member_join_count", guild_id),
        value=str(guild.member_count),
        inline=True,
    )
    _set_footer_id(embed, member)

    await _send_log_embed(guild, embed, sender_name="member_join")


async def on_member_remove(member: discord.Member) -> None:
    """Log when a member leaves or is kicked."""
    guild = member.guild
    if guild is None:
        return

    guild_id = guild.id

    joined_ago = (
        _format_timedelta(_now() - member.joined_at)
        if member.joined_at
        else "N/A"
    )

    # Collect role names
    roles = [r.name for r in member.roles if r.name != "@everyone"]
    roles_text = ", ".join(roles) if roles else get_translation("member_leave_no_roles", guild_id)

    embed = discord.Embed(
        title=get_translation("member_leave_title", guild_id),
        color=discord.Color.red(),
        timestamp=_now(),
    )
    _set_author(embed, member)

    embed.add_field(
        name=get_translation("member_leave_user", guild_id),
        value=f"{member.mention} ({member.name})",
        inline=True,
    )
    embed.add_field(
        name=get_translation("member_leave_joined_for", guild_id),
        value=joined_ago,
        inline=True,
    )
    embed.add_field(
        name=get_translation("member_leave_roles", guild_id),
        value=_safe_field_value(roles_text),
        inline=False,
    )
    embed.add_field(
        name=get_translation("member_leave_count", guild_id),
        value=str(guild.member_count),
        inline=True,
    )
    _set_footer_id(embed, member)

    await _send_log_embed(guild, embed, sender_name="member_leave")


async def on_member_update(before: discord.Member, after: discord.Member) -> None:
    """Log nickname and role changes."""
    guild = after.guild
    if guild is None:
        return

    guild_id = guild.id
    changes: list[str] = []

    # Nickname change
    if before.nick != after.nick:
        old_nick = before.nick or get_translation("member_update_no_nick", guild_id)
        new_nick = after.nick or get_translation("member_update_no_nick", guild_id)
        changes.append(
            get_translation("member_update_nickname", guild_id)
            .replace("{old}", old_nick)
            .replace("{new}", new_nick)
        )

    # Role changes
    added_roles = set(after.roles) - set(before.roles)
    removed_roles = set(before.roles) - set(after.roles)

    if added_roles:
        names = ", ".join(r.mention for r in added_roles)
        changes.append(
            get_translation("member_update_roles_added", guild_id).replace(
                "{roles}", names
            )
        )
    if removed_roles:
        names = ", ".join(r.mention for r in removed_roles)
        changes.append(
            get_translation("member_update_roles_removed", guild_id).replace(
                "{roles}", names
            )
        )

    if not changes:
        return

    embed = discord.Embed(
        title=get_translation("member_update_title", guild_id),
        color=discord.Color.blue(),
        timestamp=_now(),
    )
    _set_author(embed, after)

    embed.add_field(
        name=get_translation("member_update_user", guild_id),
        value=after.mention,
        inline=True,
    )
    embed.add_field(
        name=get_translation("member_update_changes", guild_id),
        value=_safe_field_value("\n".join(changes)),
        inline=False,
    )
    _set_footer_id(embed, after)

    await _send_log_embed(guild, embed, sender_name="member_update")


async def on_member_ban(guild: discord.Guild, user: discord.User | discord.Member) -> None:
    """Log when a user is banned."""
    guild_id = guild.id

    embed = discord.Embed(
        title=get_translation("member_ban_title", guild_id),
        color=discord.Color.dark_red(),
        timestamp=_now(),
    )
    _set_author(embed, user)

    embed.add_field(
        name=get_translation("member_ban_user", guild_id),
        value=f"{user.mention} ({user.name})",
        inline=True,
    )
    embed.add_field(
        name=get_translation("member_ban_id", guild_id),
        value=str(user.id),
        inline=True,
    )
    _set_footer_id(embed, user)

    await _send_log_embed(guild, embed, sender_name="member_ban")


async def on_member_unban(guild: discord.Guild, user: discord.User) -> None:
    """Log when a user is unbanned."""
    guild_id = guild.id

    embed = discord.Embed(
        title=get_translation("member_unban_title", guild_id),
        color=discord.Color.green(),
        timestamp=_now(),
    )
    _set_author(embed, user)

    embed.add_field(
        name=get_translation("member_unban_user", guild_id),
        value=f"{user.mention} ({user.name})",
        inline=True,
    )
    embed.add_field(
        name=get_translation("member_unban_id", guild_id),
        value=str(user.id),
        inline=True,
    )
    _set_footer_id(embed, user)

    await _send_log_embed(guild, embed, sender_name="member_unban")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_timedelta(td) -> str:
    """Format a timedelta into a human-readable string like '3d 5h 12m'."""
    total_seconds = int(td.total_seconds())
    days, remainder = divmod(total_seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, _ = divmod(remainder, 60)

    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    return " ".join(parts) if parts else "<1m"
