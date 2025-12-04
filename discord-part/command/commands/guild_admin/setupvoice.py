import discord
from fuction.private_voiceChat.private_voice import get_manager
from command.language_manager import get_translation


async def setupvoice(message, bot):
    """私人語音頻道互動式設定選單
    
    用法: >setupvoice
    """
    # Check if user is in a guild
    if not message.guild:
        return get_translation('must_be_in_guild', None)

    # Check if user has administrator permissions
    if not message.author.guild_permissions.administrator:
        return get_translation('no_permission_admin', message.guild.id)

    gid = message.guild.id

    # Create the setup embed
    embed = discord.Embed(
        title=get_translation('setupvoice_title', gid),
        description=get_translation('setupvoice_description', gid),
        color=discord.Color.blue()
    )
    
    embed.add_field(
        name="📋 什麼是私人語音頻道？",
        value=get_translation('setupvoice_what_is', gid),
        inline=False
    )
    
    embed.add_field(
        name="⚙️ 設定步驟",
        value=get_translation('setupvoice_steps', gid),
        inline=False
    )
    
    # Check current configuration
    manager = get_manager(bot)
    trigger_id = manager.get_trigger_channel(message.guild.id)
    
    if trigger_id:
        trigger_channel = message.guild.get_channel(trigger_id)
        db_config = manager.get_channel_config(trigger_id)
        if trigger_channel:
            current_status = get_translation('pv_current_trigger', gid).replace('{channel}', trigger_channel.mention)
            if db_config:
                current_status += f"\n[MySQL] type: {db_config.get('type', '')}"
        else:
            current_status = get_translation('pv_trigger_missing', gid)
    else:
        current_status = get_translation('pv_no_trigger', gid)

    embed.add_field(
        name="📊 目前狀態",
        value=get_translation('setupvoice_current_status', gid).replace('{status}', current_status),
        inline=False
    )
    
    # Get voice channels in the guild
    voice_channels = [ch for ch in message.guild.channels if isinstance(ch, discord.VoiceChannel)]
    
    if not voice_channels:
        embed.add_field(
            name=get_translation('setupvoice_no_voice_channels', gid),
            value=get_translation('setupvoice_no_voice_channels', gid),
            inline=False
        )
        return embed
    
    # Create options text
    options_text = get_translation('setupvoice_options_title', gid) + "\n\n"
    for i, channel in enumerate(voice_channels[:20], 1):  # Limit to 20 channels
        category_name = channel.category.name if channel.category else "無分類"
        options_text += f"`{i}.` {channel.name} (分類: {category_name})\n   └ ID: `{channel.id}`\n"
    
    if len(voice_channels) > 20:
        options_text += f"\n*...以及 {len(voice_channels) - 20} 個頻道*"
    
    embed.add_field(
        name=get_translation('setupvoice_options_title', gid),
        value=options_text,
        inline=False
    )
    
    embed.add_field(
        name=get_translation('setupvoice_howto', gid),
        value=get_translation('setupvoice_howto', gid).replace('{prefix}', bot.command_prefix if hasattr(bot, 'command_prefix') else '>').replace('{example_id}', str(voice_channels[0].id)),
        inline=False
    )
    
    embed.add_field(
        name=get_translation('setupvoice_tip_title', gid),
        value=get_translation('setupvoice_tip_value', gid),
        inline=False
    )
    
    embed.set_footer(text=get_translation('setupvoice_requested_by', gid).replace('{user}', str(message.author)), icon_url=message.author.display_avatar.url if message.author.display_avatar else None)
    
    return embed
