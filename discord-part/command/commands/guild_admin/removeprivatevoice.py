import discord
from fuction.private_voiceChat.private_voice import get_manager
from command.language_manager import get_translation


async def removeprivatevoice(message, bot):
    """Remove the private voice trigger channel setting
    
    Usage: >removeprivatevoice
    """
    # Check if user is in a guild
    if not message.guild:
        return get_translation('must_be_in_guild', None)

    manager = get_manager(bot)
    trigger_id = manager.get_trigger_channel(message.guild.id)

    if not trigger_id:
        return get_translation('pv_no_trigger_info', message.guild.id)

    manager.remove_trigger_channel(message.guild.id)
    return get_translation('pv_removed_success', message.guild.id)
