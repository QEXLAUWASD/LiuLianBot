import discord
from fuction.private_voiceChat.private_voice import get_manager
from command.language_manager import get_translation


async def transfervoice(message, bot):
    """Transfer ownership of your private voice channel to another member.

    Usage: >transfervoice @user
    """
    if not message.guild:
        return get_translation('must_be_in_guild', None)

    gid = message.guild.id

    # Resolve target member
    if message.mentions:
        target = message.guild.get_member(message.mentions[0].id)
    else:
        parts = message.content.strip().split()
        if len(parts) < 2:
            return get_translation('transfervoice_usage', gid).replace('{prefix}', bot.command_prefix)
        try:
            target = message.guild.get_member(int(parts[1]))
        except ValueError:
            target = None

    if target is None:
        return get_translation('invalid_user', gid)

    if target == message.author:
        return get_translation('transfervoice_self', gid)

    manager = get_manager(bot)

    channel_id = manager.user_channels.get(message.author.id)
    if channel_id is None or channel_id not in manager.private_channels:
        return get_translation('transfervoice_no_channel', gid)

    # Verify current owner matches message author
    if manager.private_channels.get(channel_id) != message.author.id:
        return get_translation('transfervoice_no_channel', gid)

    channel = message.guild.get_channel(channel_id)
    if channel is None:
        return get_translation('transfervoice_no_channel', gid)

    if target not in channel.members:
        return get_translation('transfervoice_target_not_in_channel', gid) \
            .replace('{user}', target.display_name) \
            .replace('{channel}', channel.name)

    try:
        # Revoke management perms from old owner, grant to new owner
        await channel.set_permissions(
            message.author,
            connect=True,
            speak=True,
            manage_channels=False,
            move_members=False,
            mute_members=False,
            deafen_members=False,
        )
        await channel.set_permissions(
            target,
            connect=True,
            speak=True,
            manage_channels=True,
            move_members=True,
            mute_members=True,
            deafen_members=True,
        )

        # Update tracking and DB atomically via manager method
        manager.transfer_channel_owner(channel_id, target.id)

        return get_translation('transfervoice_success', gid) \
            .replace('{user}', target.display_name) \
            .replace('{channel}', channel.mention)

    except discord.Forbidden:
        return get_translation('transfervoice_forbidden', gid)
    except Exception as e:
        return get_translation('error_executing_command', gid).replace('{error}', str(e))
