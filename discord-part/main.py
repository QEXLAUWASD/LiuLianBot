import discord
from discord.ext import commands
import os
import json
from datetime import datetime


import command.commandHandler as cmd_handler
import uilts.logger as logger
from fuction.private_voiceChat.private_voice import get_manager
from command.language_manager import get_translation
import pymysql

logger = logger.setup_logger(__name__, level=logger.logging.DEBUG)
cmd_handler = cmd_handler.handler

intents = discord.Intents.default()
intents.message_content = True # Required to access message content
intents.members = True # Required to access member permissions
intents.voice_states = True # Required for voice channel events


# get root folder path
def get_root_folder() -> str:
    return os.path.dirname(os.path.abspath(__file__))

root_folder = get_root_folder()

# Load configuration from config.json



with open(os.path.join(root_folder, 'config.json'), 'r') as f:
    config = json.load(f)

# 印出目前連線的 MySQL 資料庫名稱
mysql_config = config.get('mysql_config', {})
try:
    conn = pymysql.connect(**mysql_config)
    with conn.cursor() as cursor:
        cursor.execute('SELECT DATABASE()')
        db_name = cursor.fetchone()[0]
        print(f"[INFO] Connected to MySQL database: {db_name}")
        # print all tables in the database for debugging
        cursor.execute('SHOW TABLES')
        tables = cursor.fetchall()
        print(f"[INFO] Tables in database '{db_name}': {[table[0] for table in tables]}")
    conn.close()
except Exception as e:
    print(f"[ERROR] MySQL connection failed: {e}")

# get all onwer and admin IDs from config
bot_owners = config.get("bot_owner", [])
bot_admins = config.get("bot_admin", [])
guild_admins = config.get("guild_admins", {})

for owner_id in bot_owners:
    cmd_handler.add_bot_owner(str(owner_id))
for admin_id in bot_admins:
    cmd_handler.add_bot_admin(str(admin_id))

# Load guild-specific admins
for guild_id_str, admin_ids in guild_admins.items():
    guild_id = int(guild_id_str)
    for admin_id in admin_ids:
        cmd_handler.add_guild_admin(guild_id, str(admin_id))

BOT_OWNER_ID = bot_owners[0] if bot_owners else None  # First owner ID for legacy compatibility

Token = config.get("token") # Your bot token
command_prefix = config.get("command_prefix", ">")  # Default command prefix


bot = commands.Bot(command_prefix=command_prefix, intents=intents)


class MyClient(discord.Client):
    async def on_ready(self):
        self.start_time = datetime.now()
        # Initialize private voice manager
        self.private_voice_manager = get_manager(self)
        logger.info(f'Logged in as {self.user} (ID: {self.user.id})')
        logger.info('------')
        await self.change_presence(activity=discord.Game(name="with discord.py"))
    
    async def on_voice_state_update(self, member, before, after):
        """Handle voice state updates for private voice channels"""
        if hasattr(self, 'private_voice_manager'):
            await self.private_voice_manager.on_voice_state_update(member, before, after)
    
    @bot.event
    async def on_message(self, message):
        # Ignore messages from the bot itself
        if message.author == self.user:
            return
        
        # Check if the message starts with the command prefix
        if message.content.startswith(command_prefix):
            command_name = message.content[len(command_prefix):].split()[0]
            command_func = cmd_handler.get_command(command_name)
            
            if command_func:
                # Log command attempt
                command_type = cmd_handler.get_command_type(command_name)
                logger.info(f"Command '{command_name}' ({command_type}) requested by {message.author} (ID: {message.author.id}) in {message.guild.name if message.guild else 'DM'}")
                
                # Check if user has permission to run this command
                has_permission, error_message = cmd_handler.check_permission(
                    command_name, 
                    message.author,
                    BOT_OWNER_ID
                )
                
                if has_permission:
                    logger.info(f"Executing command '{command_name}' for {message.author}")
                    try:
                        # Check if command is async and call accordingly
                        import inspect
                        if inspect.iscoroutinefunction(command_func):
                            response = await command_func(message, self)
                        else:
                            response = command_func(message, self)
                        
                        # Send response (could be text, embed, or None)
                        if response is not None:
                            if isinstance(response, discord.Embed):
                                await message.channel.send(embed=response)
                            else:
                                await message.channel.send(response)
                        logger.info(f"Command '{command_name}' executed successfully")
                    except Exception as e:
                        logger.error(f"Error executing command '{command_name}': {e}", exc_info=True)
                        guild_id = message.guild.id if message.guild else None
                        await message.channel.send(get_translation("error_executing_command", guild_id).replace("{error}", str(e)))
                else:
                    logger.warning(f"Permission denied for {message.author} to run '{command_name}': {error_message}")
                    guild_id = message.guild.id if message.guild else None
                    # If error_message already localized, insert into generic permission_denied template
                    await message.channel.send(get_translation("permission_denied", guild_id).replace("{error}", error_message))
            else:
                logger.warning(f"Unknown command '{command_name}' requested by {message.author}")
                guild_id = message.guild.id if message.guild else None
                await message.channel.send(get_translation("cmd_not_found", guild_id).replace("{command}", command_name))
bot = MyClient(intents=intents)

if __name__ == '__main__':
    try:
        if Token is None:
            raise ValueError("Bot token is not set in config.json")
        bot.run(Token)
    except ValueError as ve:
        logger.error(f"Configuration Error: {ve}")
    except Exception as e:
        logger.error(f"An error occurred: {e}")