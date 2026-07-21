"""
Voice-channel event logging (join / leave / move).
"""

import discord
from datetime import datetime
from typing import Optional

from .base import (
    get_log_channel,
    _send_log_embed,
    _set_author,
    _set_footer_id,
    _now,
    logger,
)
from commands.language_manager import get_translation


async def on_voice_state_update(
    member: discord.Member,
    before: discord.VoiceState,
    after: discord.VoiceState,
) -> None:
    """Log voice channel join/leave/move events."""
    if member.bot:
        return

    guild: Optional[discord.Guild] = member.guild
    if guild is None:
        return

    if before.channel == after.channel:
        return

    # Determine event type
    if before.channel is None and after.channel is not None:
        event_key = "voice_event_joined"
        color = discord.Color.green()
    elif before.channel is not None and after.channel is None:
        event_key = "voice_event_left"
        color = discord.Color.red()
    else:
        event_key = "voice_event_moved"
        color = discord.Color.blue()

    guild_id = guild.id

    def _vc_label(ch: Optional[discord.VoiceChannel | discord.StageChannel]) -> str:
        if isinstance(ch, (discord.VoiceChannel, discord.StageChannel)):
            return ch.mention
        return get_translation("voice_event_no_channel", guild_id)

    embed = discord.Embed(
        title=get_translation("voice_event_title", guild_id),
        color=color,
        timestamp=_now(),
    )
    _set_author(embed, member)

    embed.add_field(
        name=get_translation("voice_event_action", guild_id),
        value=get_translation(event_key, guild_id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("voice_event_user", guild_id),
        value=member.mention,
        inline=True,
    )
    embed.add_field(
        name=get_translation("voice_event_from", guild_id),
        value=_vc_label(before.channel),
        inline=False,
    )
    embed.add_field(
        name=get_translation("voice_event_to", guild_id),
        value=_vc_label(after.channel),
        inline=False,
    )
    _set_footer_id(embed, member)

    await _send_log_embed(guild, embed, sender_name="voice_state")
