import discord
import json
from pathlib import Path
from commands.language_manager import get_translation
from core.config import CONFIG_PATH

async def removeadmin(message, bot):
    """Remove a user from the bot admins
    
    Usage: >removeadmin @user or >removeadmin user_id
    """
    try:
        # Get config path
        config_path = Path(CONFIG_PATH)
        
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
        
        # Load existing config
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        else:
            config = {}
        
        # Check if bot_admin list exists
        if 'bot_admin' not in config or not isinstance(config['bot_admin'], list):
            return get_translation("no_admins_configured", message.guild.id)
        
        # Check if user is an admin
        if str(user_id) not in config['bot_admin']:
            return get_translation("not_an_admin", message.guild.id).replace("{user}", user_name)
        
        # Remove user from admins
        config['bot_admin'] = [uid for uid in config['bot_admin'] if uid != str(user_id)]
        
        # Save config
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4)
        
        return get_translation("admin_removed", message.guild.id).replace("{user}", user_name)
    
    except Exception as e:
        print(f"Error in removeadmin: {e}")
        return get_translation("error_occurred", message.guild.id)