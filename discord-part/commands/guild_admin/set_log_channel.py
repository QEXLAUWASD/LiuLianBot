from features.server_logger.base import set_log_channel
import discord
from commands.language_manager import get_translation
from utils.async_io import run_blocking


async def setlogchannel(message, bot):
    # Usage: >setlogchannel #channel
    parts = message.content.strip().split()
    if len(parts) < 2:
        return get_translation("setlogchannel_missing_arg", message.guild.id) + "\n" + get_translation("setlogchannel_usage", message.guild.id).replace("{prefix}", bot.command_prefix)
    
    channel_arg = parts[1]
    channel_id = None
    
    # Check if it's a mention
    if channel_arg.startswith('<#') and channel_arg.endswith('>'):
        try:
            channel_id = int(channel_arg[2:-1])
        except ValueError:
            pass
    else:
        try:
            channel_id = int(channel_arg)
        except ValueError:
            pass
            
    if channel_id:
        channel = message.guild.get_channel(channel_id)
        if channel:
            # Ensure it's a text channel
            if not isinstance(channel, (discord.TextChannel, discord.Thread)):
                 return get_translation("setlogchannel_not_text", message.guild.id)

            await run_blocking(set_log_channel, message.guild.id, channel_id)
            return get_translation("setlogchannel_success", message.guild.id).replace("{channel}", channel.mention)
        else:
            return get_translation("setlogchannel_channel_not_found", message.guild.id)
    else:
        return get_translation("setlogchannel_invalid_arg", message.guild.id).replace("{arg}", channel_arg)
