import discord
import commands.handler as cmd_handler
from commands.language_manager import get_translation


async def listguildadmins(message, bot):
    """列出此伺服器的所有伺服器管理員
    
    用法: >listguildadmins
    """
    # Check if user is in a guild
    if not message.guild:
        return get_translation("no_guild", None)
    
    guild_admins = cmd_handler.handler.get_guild_admins(message.guild.id)
    
    embed = discord.Embed(
        title=get_translation("listguildadmins_title", message.guild.id).replace("{guild}", message.guild.name),
        color=discord.Color.blue()
    )
    
    if not guild_admins:
        embed.description = get_translation("listguildadmins_no_admins", message.guild.id)
        embed.add_field(
            name="ℹ️ 如何新增管理員",
            value=get_translation("listguildadmins_howto", message.guild.id).replace("{prefix}", bot.command_prefix if hasattr(bot, 'command_prefix') else '>'),
            inline=False
        )
    else:
        admin_list = []
        for user_id in guild_admins:
            try:
                user = await bot.fetch_user(int(user_id))
                admin_list.append(f"• {user.mention} - **{user}**\n  └ ID: `{user_id}`")
            except:
                admin_list.append(f"• 使用者 ID: `{user_id}` (找不到使用者)")
        
        embed.description = f"**伺服器管理員總數:** {len(guild_admins)}\n\n" + "\n".join(admin_list)
        
        embed.add_field(
            name=get_translation("listguildadmins_note_name", message.guild.id),
            value=get_translation("listguildadmins_note_value", message.guild.id),
            inline=False
        )
    
    embed.set_footer(text=get_translation("requested_by", message.guild.id).replace("{user}", str(message.author)), icon_url=message.author.display_avatar.url if message.author.display_avatar else None)
    
    return embed
