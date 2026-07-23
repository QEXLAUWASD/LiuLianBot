import discord
from features.private_voice_chat.private_voice import get_manager
from commands.language_manager import get_translation
from utils.error_reporting import report_exception


async def _compensate_permissions(
    channel,
    previous_owner,
    previous_overwrite,
    new_owner,
    new_owner_overwrite,
    logger,
):
    try:
        await channel.set_permissions(
            previous_owner,
            overwrite=previous_overwrite,
        )
    except Exception:
        logger.error(
            "Private voice permission compensation failed for previous owner",
            exc_info=True,
        )

    try:
        await channel.set_permissions(
            new_owner,
            overwrite=new_owner_overwrite,
        )
    except Exception:
        logger.error(
            "Private voice permission compensation failed for new owner",
            exc_info=True,
        )


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

    channel_id = manager.get_user_channel(gid, message.author.id)
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
        overwrites = channel.overwrites
        previous_overwrite = overwrites.get(message.author)
        new_owner_overwrite = overwrites.get(target)
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
        try:
            await channel.set_permissions(
                target,
                connect=True,
                speak=True,
                manage_channels=True,
                move_members=True,
                mute_members=True,
                deafen_members=True,
            )
            await manager.transfer_channel_owner(gid, channel_id, target.id)
        except Exception:
            await _compensate_permissions(
                channel,
                message.author,
                previous_overwrite,
                target,
                new_owner_overwrite,
                bot.logger,
            )
            raise

        return get_translation('transfervoice_success', gid) \
            .replace('{user}', target.display_name) \
            .replace('{channel}', channel.mention)

    except discord.Forbidden:
        return get_translation('transfervoice_forbidden', gid)
    except Exception:
        return report_exception(
            bot.logger,
            "transfervoice",
            get_translation('error_executing_command', gid),
        )
