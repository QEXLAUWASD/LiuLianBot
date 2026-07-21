import discord
import commands.handler as cmd_handler
from commands.language_manager import get_translation


async def mypermissions(message, bot):
    """檢查您在此伺服器的權限等級
    
    用法: >mypermissions
    """
    handler = cmd_handler.handler

    # Get user's permission level
    permission_level = handler.get_permission_level(message.author)

    gid = message.guild.id if message.guild else None

    # Build permission info from translation keys
    info = {
        'emoji': '👑' if permission_level == 'owner' else (
            '🏰' if permission_level == 'guild_owner' else (
            '🔧' if permission_level == 'admin' else (
            '🛡️' if permission_level == 'guild_admin' else '👥'))),
        'name': get_translation(f"{permission_level}_name", gid),
        'color': (discord.Color.gold() if permission_level == 'owner' else
                  discord.Color.purple() if permission_level == 'guild_owner' else
                  discord.Color.red() if permission_level == 'admin' else
                  discord.Color.blue() if permission_level == 'guild_admin' else
                  discord.Color.green()),
        'description': get_translation(f"{permission_level}_desc", gid),
        'can_use': {
            'owner': ['owner', 'guild_owner', 'admin', 'guild_admin', 'user'],
            'guild_owner': ['guild_owner', 'admin', 'guild_admin', 'user'],
            'admin': ['admin', 'guild_admin', 'user'],
            'guild_admin': ['guild_admin', 'user'],
            'user': ['user']
        }[permission_level]
    }

    embed = discord.Embed(
        title=get_translation('permissions_title', gid).replace('{emoji}', info['emoji']),
        description=get_translation('permissions_description', gid).replace('{name}', info['name']).replace('{description}', info['description']),
        color=info['color']
    )
    
    # Show what command types they can use
    can_use_text = ", ".join([f"`{cmd}`" for cmd in info['can_use']])
    embed.add_field(
        name=get_translation('can_use_title', gid),
        value=can_use_text,
        inline=False
    )
    
    # Show specific permissions
    # Fetch permission list from locale arrays if available
    perm_list_key_map = {
        'owner': 'owner_perms_list',
        'guild_owner': 'guild_owner_perms_list',
        'admin': 'admin_perms_list',
        'guild_admin': 'guild_admin_perms_list',
        'user': 'user_perms_list'
    }

    raw_perms = get_translation(perm_list_key_map.get(permission_level, 'user_perms_list'), gid)
    # If translation returns a list, use it; otherwise fallback to a small default
    if isinstance(raw_perms, list):
        permissions_list = raw_perms
    else:
        permissions_list = [get_translation('user_perms_list', gid)]
    
    embed.add_field(
        name=get_translation('your_permissions_title', gid),
        value="\n".join(permissions_list),
        inline=False
    )
    
    # Show user info
    embed.add_field(
        name=get_translation('user_info_title', gid),
        value=f"{message.author.mention}\nID: `{message.author.id}`",
        inline=False
    )
    
    if message.guild:
        embed.set_footer(
            text=get_translation('server_footer', gid).replace('{guild}', message.guild.name),
            icon_url=message.guild.icon.url if message.guild.icon else None
        )
    
    return embed
