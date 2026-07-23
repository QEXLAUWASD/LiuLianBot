import discord
import commands.handler as cmd_handler
from commands.language_manager import get_translation
from core.config import get_config, update_config
from utils.error_reporting import report_exception


async def removeguildadmin(message, bot):
    """Remove a user from guild admin list
    
    Usage: >removeguildadmin @user or >removeguildadmin user_id
    """
    # Check if user is in a guild
    if not message.guild:
        return get_translation("no_guild", None)
    
    # Check permissions (must be server admin or bot owner)
    is_server_admin = message.author.guild_permissions.administrator
    is_bot_owner = str(message.author.id) in cmd_handler.handler.bot_owners
    
    if not (is_server_admin or is_bot_owner):
        return get_translation("no_permission_admin", message.guild.id)
    
    try:
        # Parse user from message
        parts = message.content.split()
        if len(parts) < 2:
            return get_translation("usage_removeguildadmin", message.guild.id)
        
        # Try to get user ID from mention or direct ID
        user_id = None
        if message.mentions:
            user_id = message.mentions[0].id
            user_name = str(message.mentions[0])
        else:
            # Try to parse as user ID
            try:
                user_id = int(parts[1].strip('<@!>'))
                try:
                    user = await bot.fetch_user(user_id)
                    user_name = str(user)
                except:
                    user_name = f"User ID {user_id}"
            except ValueError:
                return get_translation("invalid_user_id", message.guild.id)
        
        config = get_config()
        guild_id_str = str(message.guild.id)
        
        # Check if guild has any admins
        if 'guild_admins' not in config or guild_id_str not in config['guild_admins']:
            return get_translation("no_guild_admins", message.guild.id)
        
        # Check if user is a guild admin
        user_id_str = str(user_id)
        if user_id_str not in [str(admin_id) for admin_id in config['guild_admins'][guild_id_str]]:
            return get_translation("user_not_guild_admin", message.guild.id).replace("{user}", user_name)

        def apply(current):
            guild_admins = current['guild_admins']
            guild_admins[guild_id_str] = [
                admin_id for admin_id in guild_admins[guild_id_str]
                if str(admin_id) != user_id_str
            ]
            if not guild_admins[guild_id_str]:
                del guild_admins[guild_id_str]
            if not guild_admins:
                del current['guild_admins']

        update_config(apply)
        
        # Also remove from runtime handler
        cmd_handler.handler.remove_guild_admin(message.guild.id, user_id_str)
        
        return get_translation("removeguildadmin_success", message.guild.id).replace("{user}", user_name)
    
    except Exception:
        return report_exception(
            bot.logger,
            "removeguildadmin",
            get_translation("error_removing_guild_admin", message.guild.id),
        )
