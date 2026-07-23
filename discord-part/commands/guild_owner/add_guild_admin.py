import discord
import commands.handler as cmd_handler
from commands.language_manager import get_translation
from core.config import get_config, update_config
from utils.error_reporting import report_exception


async def addguildadmin(message, bot):
    """Add a user as admin for this specific guild
    
    Usage: >addguildadmin @user or >addguildadmin user_id
    """
    # Check if user is in a guild
    if not message.guild:
        return get_translation("must_be_in_guild", None)

    # Check permissions (must be server admin or bot owner)
    is_server_admin = message.author.guild_permissions.administrator
    is_bot_owner = str(message.author.id) in cmd_handler.handler.bot_owners

    if not (is_server_admin or is_bot_owner):
        return get_translation("no_permission_admin", message.guild.id)
    
    try:
        # Parse user from message
        parts = message.content.split()
        if len(parts) < 2:
            return get_translation("usage_addguildadmin", message.guild.id)
        
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
        user_id_str = str(user_id)
        guild_admins = config.get('guild_admins', {}).get(guild_id_str, [])
        # Check if user is already a guild admin
        if user_id_str in [str(admin_id) for admin_id in guild_admins]:
            return get_translation("already_guild_admin", message.guild.id).replace("{user}", user_name)

        def apply(current):
            admins = current.setdefault('guild_admins', {}).setdefault(guild_id_str, [])
            admins.append(user_id_str)

        update_config(apply)
        
        # Also add to runtime handler
        cmd_handler.handler.add_guild_admin(message.guild.id, user_id_str)
        
        # Create success embed
        embed = discord.Embed(
            title=get_translation('addguildadmin_title', message.guild.id),
            description=get_translation('addguildadmin_desc', message.guild.id).replace('{user}', user_name),
            color=discord.Color.green()
        )

        embed.add_field(
            name=get_translation('addguildadmin_user_field', message.guild.id),
            value=f"{user_name}\nID: `{user_id}`",
            inline=False
        )

        embed.add_field(
            name=get_translation('addguildadmin_permissions_field', message.guild.id),
            value=get_translation('addguildadmin_permissions_desc', message.guild.id),
            inline=False
        )

        embed.set_footer(text=get_translation('addguildadmin_added_by', message.guild.id).replace('{user}', str(message.author)), icon_url=message.author.display_avatar.url if message.author.display_avatar else None)

        return embed
    
    except Exception:
        return report_exception(
            bot.logger,
            "addguildadmin",
            get_translation('error_adding_guild_admin', message.guild.id),
        )
