import discord
from fuction.private_voiceChat.private_voice import get_manager
from command.language_manager import get_translation


async def setprivatevoice(message, bot):
    """Set a voice channel as the trigger for creating private channels
    
    Usage: >setprivatevoice <channel_id or channel_mention>
    Example: >setprivatevoice 123456789012345678
    """
    # Check if user is in a guild
    if not message.guild:
        return get_translation("must_be_in_guild", None)
    
    parts = message.content.split()
    
    # If no channel specified, show current setting
    if len(parts) < 2:
        manager = get_manager(bot)
        trigger_id = manager.get_trigger_channel(message.guild.id)
        gid = message.guild.id
        embed = discord.Embed(
            title=get_translation('pv_title', gid),
            color=discord.Color.blue()
        )
        
        if trigger_id:
            channel = message.guild.get_channel(trigger_id)
            if channel:
                embed.description = get_translation('pv_current_trigger', gid).replace('{channel}', channel.mention) + "\n\n" + get_translation('pv_channel_details', gid)
                embed.add_field(name=get_translation('pv_channel_details', gid), value="", inline=True)
                embed.add_field(name=get_translation('pv_trigger_field', gid), value=f"`{channel.id}`", inline=True)
                if channel.category:
                    embed.add_field(name=get_translation('pv_category_field', gid), value=channel.category.name, inline=True)
                embed.add_field(
                    name="ℹ️ " + get_translation('pv_what_happens_title', gid),
                    value=get_translation('pv_how_it_works', gid).replace('{channel}', channel.mention),
                    inline=False
                )
            else:
                embed.description = get_translation('pv_trigger_missing', gid)
                embed.add_field(
                    name=get_translation('pv_set_instructions', gid),
                    value=get_translation('pv_set_instructions', gid).replace('{prefix}', bot.command_prefix if hasattr(bot, 'command_prefix') else message.content.split()[0]),
                    inline=False
                )
        else:
            embed.description = get_translation('pv_no_trigger', gid)
            embed.add_field(
                name=get_translation('pv_set_instructions', gid),
                value=get_translation('pv_set_instructions', gid).replace('{prefix}', bot.command_prefix if hasattr(bot, 'command_prefix') else message.content.split()[0]),
                inline=False
            )
        
        embed.set_footer(text=get_translation('field_requested_by', gid).replace('{user}', str(message.author)), icon_url=message.author.display_avatar.url if message.author.display_avatar else None)
        return embed
    
    # Try to get channel from mention or ID
    channel = None
    
    # Check for channel mention
    if message.channel_mentions:
        return get_translation('pv_provide_voice_only', message.guild.id)
    
    # Try to parse as channel ID
    try:
        channel_id = int(parts[1].strip('<>#'))
        channel = message.guild.get_channel(channel_id)
    except ValueError:
        return get_translation('pv_invalid_channel_id', message.guild.id)
    
    # Validate channel
    if not channel:
        return get_translation('pv_channel_not_found', message.guild.id)
    
    if not isinstance(channel, discord.VoiceChannel):
        return get_translation('pv_not_voice_channel', message.guild.id)
    
    # Set the trigger channel
    manager = get_manager(bot)
    manager.set_trigger_channel(message.guild.id, channel.id)

    # Save the channel configuration
    manager.save_channel_config(message.guild.id, channel.id, message.author.id, {"type": "trigger"})
    
    # Create success embed
    gid = message.guild.id
    embed = discord.Embed(
        title=get_translation('pv_configured_title', gid),
        description=get_translation('pv_configured_desc', gid).replace('{channel_name}', channel.name),
        color=discord.Color.green()
    )
    
    embed.add_field(
        name=get_translation('pv_trigger_field', gid),
        value=f"{channel.mention} (`{channel.id}`)",
        inline=False
    )
    
    if channel.category:
        embed.add_field(
            name=get_translation('pv_category_field', gid),
            value=f"Private channels will be created in: **{channel.category.name}**",
            inline=False
        )
    
    # Add localized bullets if available
    bullets = get_translation('pv_what_happens_bullets', gid)
    if isinstance(bullets, list):
        value = "\n".join([b.replace('{channel}', channel.mention) for b in bullets])
    else:
        value = get_translation('pv_what_happens_title', gid).replace('{channel}', channel.mention)

    embed.add_field(
        name=get_translation('pv_what_happens_title', gid),
        value=value,
        inline=False
    )
    
    embed.add_field(
        name=get_translation('pv_tip_title', gid),
        value=get_translation('pv_tip_text', gid),
        inline=False
    )
    
    embed.set_footer(text=get_translation('pv_configured_by', gid).replace('{user}', str(message.author)), icon_url=message.author.display_avatar.url if message.author.display_avatar else None)
    
    return embed
