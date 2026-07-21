"""
Message-related log events (edit, delete, bulk-delete).
"""

import discord
from datetime import datetime
from typing import Optional

from .base import (
    get_log_channel,
    _safe_field_value,
    _channel_mention,
    _send_log_embed,
    _set_author,
    _set_footer_id,
    _now,
    logger,
)
from command.language_manager import get_translation


async def on_message_edit(before: discord.Message, after: discord.Message) -> None:
    """Log message edits to the configured log channel."""
    if before.author.bot:
        return
    if before.content == after.content:
        return

    guild: Optional[discord.Guild] = before.guild
    if guild is None:
        return

    guild_id = guild.id

    before_content = _safe_field_value(
        before.content or get_translation("no_text_content", guild_id)
    )
    after_content = _safe_field_value(
        after.content or get_translation("no_text_content", guild_id)
    )

    embed = discord.Embed(
        title=get_translation("message_edited_title", guild_id),
        color=discord.Color.orange(),
        timestamp=_now(),
    )
    _set_author(embed, before.author)

    embed.add_field(
        name=get_translation("original_message", guild_id),
        value=before_content,
        inline=False,
    )
    embed.add_field(
        name=get_translation("modified_message", guild_id),
        value=after_content,
        inline=False,
    )
    embed.add_field(
        name=get_translation("channel", guild_id),
        value=_channel_mention(before.channel, guild_id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("jump_to_message", guild_id),
        value=f"[Jump]({after.jump_url})",
        inline=True,
    )
    _set_footer_id(embed, before.author)

    await _send_log_embed(guild, embed, sender_name="message_edit")


async def on_message_delete(message: discord.Message) -> None:
    """Log deleted messages to the configured log channel."""
    if message.author.bot:
        return

    guild: Optional[discord.Guild] = message.guild
    if guild is None:
        return

    guild_id = guild.id

    content = _safe_field_value(
        message.content or get_translation("no_text_content", guild_id)
    )

    attachment_info = []
    for att in message.attachments:
        attachment_info.append(f"{att.filename} ({att.url})")
    attachments_text = "\n".join(attachment_info) if attachment_info else "None"

    embed = discord.Embed(
        title=get_translation("message_deleted_title", guild_id),
        color=discord.Color.red(),
        timestamp=_now(),
    )
    _set_author(embed, message.author)

    embed.add_field(
        name=get_translation("original_message", guild_id),
        value=content,
        inline=False,
    )
    embed.add_field(
        name=get_translation("channel", guild_id),
        value=_channel_mention(message.channel, guild_id),
        inline=True,
    )
    embed.add_field(
        name=get_translation("attachments", guild_id),
        value=attachments_text,
        inline=False,
    )
    _set_footer_id(embed, message.author)

    await _send_log_embed(guild, embed, sender_name="message_delete")


async def on_bulk_message_delete(messages: list[discord.Message]) -> None:
    """Log bulk message deletions (purges)."""
    if not messages:
        return

    # Use the first message's guild for context
    first = messages[0]
    guild: Optional[discord.Guild] = first.guild
    if guild is None:
        return

    guild_id = guild.id

    channel_label = _channel_mention(first.channel, guild_id)

    # Build compact content log
    lines: list[str] = []
    for msg in messages[:20]:  # cap at 20 entries to avoid embed limit
        author_name = (
            msg.author.display_name if msg.author else "Unknown"
        )
        content_preview = _safe_field_value(
            msg.content or get_translation("no_text_content", guild_id),
            max_len=200,
        )
        lines.append(f"**{author_name}**: {content_preview}")

    if len(messages) > 20:
        lines.append(
            get_translation("bulk_delete_more", guild_id).replace(
                "{count}", str(len(messages) - 20)
            )
        )

    embed = discord.Embed(
        title=get_translation("bulk_delete_title", guild_id),
        color=discord.Color.dark_red(),
        timestamp=_now(),
    )
    embed.add_field(
        name=get_translation("bulk_delete_count", guild_id),
        value=str(len(messages)),
        inline=True,
    )
    embed.add_field(
        name=get_translation("channel", guild_id),
        value=channel_label,
        inline=True,
    )
    embed.add_field(
        name=get_translation("bulk_delete_messages", guild_id),
        value=_safe_field_value("\n".join(lines), max_len=1024),
        inline=False,
    )

    await _send_log_embed(guild, embed, sender_name="bulk_delete")
