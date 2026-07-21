import discord
import json
from pathlib import Path
from commands.language_manager import get_translation
from core.config import CONFIG_PATH


async def addadmin(message, bot):
    """Add a user as admin to the bot
    
    Usage: >addadmin @user or >addadmin user_id
    """
    try:
        # Get config path
        config_path = Path(CONFIG_PATH)
        
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
        
        # Load existing config
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        else:
            config = {}
        
        # Initialize bot_admin list if not exists
        if 'bot_admin' not in config:
            config['bot_admin'] = []
        
        # Check if user is already admin
        if user_id in config['bot_admin']:
            return get_translation("already_admin", message.guild.id).replace("{user}", user_name)
        
        # Add user to admins
        config['bot_admin'].append(f"{user_id}")
        
        # Save config
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4)
        
        # Also add to runtime handler
        import commands.handler as cmd_handler
        cmd_handler.handler.add_bot_admin(str(user_id))
        
        return get_translation("addadmin_success", message.guild.id).replace("{user}", user_name)
    
    except Exception as e:
        return get_translation("error_adding_admin", message.guild.id).replace("{error}", str(e))