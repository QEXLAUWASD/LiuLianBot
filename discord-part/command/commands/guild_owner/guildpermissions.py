import discord
import command.commandHandler as cmd_handler
from command.language_manager import get_translation


async def guildpermissions(message, bot):
    """View all permission levels in this guild (guild owner only)
    
    Usage: >guildpermissions
    """
    if not message.guild:
        return get_translation('must_be_in_guild', None)

    gid = message.guild.id

    embed = discord.Embed(
        title=get_translation('permstruct_title', gid).replace('{guild}', message.guild.name),
        description=get_translation('permstruct_desc', gid),
        color=discord.Color.blue()
    )
    
    # Server Owner
    owner = message.guild.owner
    embed.add_field(
        name=get_translation('perm_owner_field', gid),
        value=get_translation('perm_owner_value', gid)
              .replace('{owner_mention}', owner.mention if owner else 'Unknown')
              .replace('{owner_name}', str(owner) if owner else 'Unknown')
              .replace('{owner_id}', str(owner.id) if owner else 'Unknown'),
        inline=False
    )
    
    # Guild Admins
    guild_admins = cmd_handler.handler.get_guild_admins(message.guild.id)
    if guild_admins:
        admin_list = []
        for user_id in guild_admins:
            try:
                user = await bot.fetch_user(int(user_id))
                admin_list.append(f"• {user.mention} - **{user}**")
            except:
                admin_list.append(f"• ID: `{user_id}` (User not found)")
        
        embed.add_field(
            name=get_translation('perm_guild_admins_title', gid).replace('{count}', str(len(guild_admins))),
            value="\n".join(admin_list) + "\n" + get_translation('perm_guild_admins_note', gid),
            inline=False
        )
    else:
        embed.add_field(
            name=get_translation('perm_guild_admins_title', gid).replace('{count}', '0'),
            value=get_translation('perm_guild_admins_none', gid),
            inline=False
        )
    
    # Discord Server Administrators
    server_admins = [m for m in message.guild.members if m.guild_permissions.administrator and m.id != owner.id]
    if server_admins:
        admin_count = len(server_admins)
        if admin_count > 10:
            embed.add_field(
                name=get_translation('perm_discord_admins_title', gid).replace('{count}', str(admin_count)),
                value=get_translation('perm_discord_admins_many', gid).replace('{count}', str(admin_count)),
                inline=False
            )
        else:
            admin_names = [f"• {m.mention}" for m in server_admins[:10]]
            embed.add_field(
                name=get_translation('perm_discord_admins_title', gid).replace('{count}', str(admin_count)),
                value=get_translation('perm_discord_admins_few_value', gid).replace('{names}', "\n".join(admin_names)).replace('{count}', str(admin_count)),
                inline=False
            )
    
    # Permission levels explanation
    embed.add_field(
        name=get_translation('perm_levels_explanation', gid).split('\n')[0] if False else "📋 Permission Levels",
        value=get_translation('perm_levels_explanation', gid),
        inline=False
    )
    
    embed.set_footer(text=get_translation('perm_requested_by', gid).replace('{user}', str(message.author)), icon_url=message.author.display_avatar.url if message.author.display_avatar else None)
    
    return embed
