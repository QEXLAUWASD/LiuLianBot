from commands.language_manager import get_translation
from core.config import get_config, update_config

async def removeadmin(message, bot):
    """Remove a user from the bot admins
    
    Usage: >removeadmin @user or >removeadmin user_id
    """
    try:
        # Parse user from message
        parts = message.content.split()
        if len(parts) < 2:
            return get_translation("usage_removeadmin", message.guild.id)
        
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
        
        return get_translation("admin_removed", message.guild.id).replace("{user}", user_name)
    
    except Exception as e:
        print(f"Error in removeadmin: {e}")
        return get_translation("error_occurred", message.guild.id)
