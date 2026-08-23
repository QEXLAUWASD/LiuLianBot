from commands.language_manager import get_translation
from commands.user_target import resolve_user_target
from core.config import get_config, update_config
from utils.error_reporting import report_exception


async def addadmin(message, bot):
    """Add a user as admin to the bot
    
    Usage: >addadmin @user or >addadmin user_id
    """
    try:
        try:
            target = await resolve_user_target(message, bot)
        except ValueError:
            return get_translation("invalid_user_id", message.guild.id)
        if target is None:
            return get_translation("usage_addadmin", message.guild.id)

        user_id = target.id
        user_name = target.name
        user_id_str = str(user_id)
        config = get_config()
        # Check if user is already admin
        if user_id_str in config.get('bot_admin', []):
            return get_translation("already_admin", message.guild.id).replace("{user}", user_name)

        update_config(
            lambda current: current.setdefault('bot_admin', []).append(user_id_str)
        )
        
        # Also add to runtime handler
        bot.command_handler.add_bot_admin(user_id_str)
        
        return get_translation("addadmin_success", message.guild.id).replace("{user}", user_name)
    
    except Exception:
        return report_exception(
            bot.logger,
            "addadmin",
            get_translation("error_adding_admin", message.guild.id),
        )
