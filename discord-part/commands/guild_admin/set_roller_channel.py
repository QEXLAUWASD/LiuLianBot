import discord

from commands.language_manager import get_translation
from commands.roller_service import send_roller_prompt
from features.r6_roll.roller_channel import set_roller_channel
from utils.async_io import run_blocking


async def setrollerchannel(message, bot):
    """Set the channel where `roller` is allowed, and roll results are sent via DM."""

    if not message.guild:
        return get_translation("no_guild", None)

    parts = message.content.strip().split()
    if len(parts) < 2:
        prefix = bot.command_prefix if hasattr(bot, "command_prefix") else ">"
        return (
            get_translation("setrollerchannel_missing_arg", message.guild.id)
            + "\n"
            + get_translation("setrollerchannel_usage", message.guild.id).replace("{prefix}", prefix)
        )

    channel_arg = parts[1]
    channel_id = None

    # Mention: <#123>
    if channel_arg.startswith("<#") and channel_arg.endswith(">"):
        try:
            channel_id = int(channel_arg[2:-1])
        except ValueError:
            channel_id = None
    else:
        try:
            channel_id = int(channel_arg)
        except ValueError:
            channel_id = None

    if not channel_id:
        return get_translation("setrollerchannel_invalid_arg", message.guild.id).replace("{arg}", channel_arg)

    channel = message.guild.get_channel(channel_id)
    if not channel:
        return get_translation("setrollerchannel_channel_not_found", message.guild.id)

    if not isinstance(channel, (discord.TextChannel, discord.Thread)):
        return get_translation("setrollerchannel_not_text", message.guild.id)

    # Optional mode arg: dm / channel
    dm_result = True
    if len(parts) >= 3:
        mode = parts[2].strip().lower()
        if mode in ("dm", "d", "private"):
            dm_result = True
        elif mode in ("channel", "ch", "public"):
            dm_result = False
        else:
            return get_translation("setrollermode_invalid", message.guild.id).replace("{mode}", parts[2])

    await run_blocking(
        set_roller_channel,
        message.guild.id,
        channel_id,
        dm_result=dm_result,
    )
    # Post the roller UI message in the configured channel immediately.
    try:
        await send_roller_prompt(channel, message.guild.id, dm_result=dm_result)
    except Exception:
        # Don't fail the command if posting the prompt fails.
        pass

    return get_translation("setrollerchannel_success", message.guild.id).replace("{channel}", channel.mention)
