import discord
import platform
import psutil
import os
from datetime import datetime
from command.language_manager import get_translation


async def getinfo(message, bot):
    """Get detailed information about the bot"""
    
    # Bot information
    bot_user = bot.user
    guild_count = len(bot.guilds)
    total_members = sum(guild.member_count for guild in bot.guilds)
    
    # System information
    python_version = platform.python_version()
    discord_version = discord.__version__
    os_info = f"{platform.system()} {platform.release()}"
    
    # Process information
    process = psutil.Process(os.getpid())
    memory_usage = process.memory_info().rss / 1024 / 1024  # MB
    cpu_usage = process.cpu_percent(interval=1)
    
    # Uptime
    uptime = datetime.now() - bot.start_time if hasattr(bot, 'start_time') else None
    
    gid = message.guild.id if message.guild else None
    embed = discord.Embed(
        title=get_translation('getinfo_title', gid).replace('{name}', bot_user.name),
        color=discord.Color.blue(),
        timestamp=datetime.now()
    )
    embed.add_field(name=get_translation('field_bot_id', gid), value=bot_user.id, inline=True)
    embed.add_field(name=get_translation('field_servers', gid), value=guild_count, inline=True)
    embed.add_field(name=get_translation('field_total_members', gid), value=total_members, inline=True)

    embed.add_field(name=get_translation('field_python_version', gid), value=python_version, inline=True)
    embed.add_field(name=get_translation('field_discord_version', gid), value=discord_version, inline=True)
    embed.add_field(name=get_translation('field_os', gid), value=os_info, inline=True)

    embed.add_field(name=get_translation('field_memory', gid), value=f"{memory_usage:.2f} MB", inline=True)
    embed.add_field(name=get_translation('field_cpu', gid), value=f"{cpu_usage:.2f}%", inline=True)
    
    if uptime:
        days = uptime.days
        hours, remainder = divmod(uptime.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        uptime_str = f"{days}d {hours}h {minutes}m {seconds}s"
        embed.add_field(name=get_translation('field_uptime', gid), value=uptime_str, inline=True)
    
    embed.set_thumbnail(url=bot_user.display_avatar.url if bot_user.display_avatar else None)
    embed.set_footer(text=get_translation('field_requested_by', gid).replace('{user}', str(message.author)), icon_url=message.author.display_avatar.url if message.author.display_avatar else None)
    
    return embed
