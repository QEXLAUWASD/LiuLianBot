from commands.language_manager import get_translation
from commands.user_target import resolve_user_target
from core.config import get_config, update_config
from utils.error_reporting import report_exception

async def removeadmin(message, bot):
    """Remove a user from the bot admins
    
    Usage: >removeadmin @user or >removeadmin user_id
    """
    try:
        try:
            target = await resolve_user_target(message, bot)
        except ValueError:
            return get_translation("invalid_user_id", message.guild.id)
        if target is None:
            return get_translation("usage_removeadmin", message.guild.id)

        user_id = target.id
        user_name = target.name
        config = get_config()
        # Check if bot_admin list exists
        if 'bot_admin' not in config or not isinstance(config['bot_admin'], list):
            return get_translation("no_admins_configured", message.guild.id)
        
        # Check if user is an admin
        if str(user_id) not in config['bot_admin']:
            return get_translation("not_an_admin", message.guild.id).replace("{user}", user_name)
        
        # Remove user from admins
        user_id_str = str(user_id)
        update_config(
            lambda current: current.update(
                bot_admin=[
                    uid for uid in current.get('bot_admin', [])
                    if uid != user_id_str
                ]
            )
        )

        bot.command_handler.remove_bot_admin(user_id_str)
        
        return get_translation("admin_removed", message.guild.id).replace("{user}", user_name)
    
    except Exception:
        return report_exception(
            bot.logger,
            "removeadmin",
            get_translation("error_occurred", message.guild.id),
        )
