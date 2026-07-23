from commands.language_manager import get_translation
from core.config import get_config, update_config
from utils.error_reporting import report_exception


async def addadmin(message, bot):
    """Add a user as admin to the bot
    
    Usage: >addadmin @user or >addadmin user_id
    """
    try:
        # Parse user from message
        parts = message.content.split()
        if len(parts) < 2:
            return get_translation("usage_addadmin", message.guild.id)
        
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
        
        user_id_str = str(user_id)
        config = get_config()
        # Check if user is already admin
        if user_id_str in config.get('bot_admin', []):
            return get_translation("already_admin", message.guild.id).replace("{user}", user_name)

        update_config(
            lambda current: current.setdefault('bot_admin', []).append(user_id_str)
        )
        
        # Also add to runtime handler
        import commands.handler as cmd_handler
        cmd_handler.handler.add_bot_admin(user_id_str)
        
        return get_translation("addadmin_success", message.guild.id).replace("{user}", user_name)
    
    except Exception:
        return report_exception(
            bot.logger,
            "addadmin",
            get_translation("error_adding_admin", message.guild.id),
        )
