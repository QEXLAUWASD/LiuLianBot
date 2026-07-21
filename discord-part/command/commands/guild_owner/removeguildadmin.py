import discord
import json
import os
from pathlib import Path
import command.commandHandler as cmd_handler
from command.language_manager import get_translation


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
        # Get config path
        config_path = Path(__file__).parent.parent.parent.parent / "config.json"
        
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
        
        # Load existing config
        if not config_path.exists():
            return get_translation("no_guild_admins", message.guild.id)
        
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        guild_id_str = str(message.guild.id)
        
        # Check if guild has any admins
        if 'guild_admins' not in config or guild_id_str not in config['guild_admins']:
            return get_translation("no_guild_admins", message.guild.id)
        
        # Check if user is a guild admin
        if user_id not in config['guild_admins'][guild_id_str]:
            return get_translation("user_not_guild_admin", message.guild.id).replace("{user}", user_name)
        
        # Remove user from guild admins
        config['guild_admins'][guild_id_str].remove(user_id)
        
        # Clean up empty lists
        if not config['guild_admins'][guild_id_str]:
            del config['guild_admins'][guild_id_str]
        if not config['guild_admins']:
            del config['guild_admins']
        
        # Save config
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4)
        
        # Also remove from runtime handler
        cmd_handler.handler.remove_guild_admin(message.guild.id, str(user_id))
        
        return get_translation("removeguildadmin_success", message.guild.id).replace("{user}", user_name)
    
    except Exception as e:
        return get_translation("error_removing_guild_admin", message.guild.id).replace("{error}", str(e))
