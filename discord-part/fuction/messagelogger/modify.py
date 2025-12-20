import discord
import pymysql
import json
import os
from datetime import datetime
from typing import Optional
from command.language_manager import get_translation
import uilts.logger as log_helper

# Load config
def get_config_path():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'config.json')

def get_db_conn():
    with open(get_config_path(), 'r', encoding='utf-8') as f:
        config = json.load(f)
    mysql_config = config.get('mysql_config', {})
    return pymysql.connect(**mysql_config)

def init_log_channel_table():
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS guild_log_channels (
                    guild_id BIGINT PRIMARY KEY,
                    channel_id BIGINT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            ''')
        conn.commit()
    finally:
        conn.close()

# Initialize table on module load
init_log_channel_table()

# Local logger to avoid circular imports
logger = log_helper.setup_logger(__name__, level=log_helper.logging.INFO)

def set_log_channel(guild_id, channel_id):
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            sql = "INSERT INTO guild_log_channels (guild_id, channel_id) VALUES (%s, %s) ON DUPLICATE KEY UPDATE channel_id=%s"
            cursor.execute(sql, (guild_id, channel_id, channel_id))
        conn.commit()
    finally:
        conn.close()

def get_log_channel(guild_id):
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            sql = "SELECT channel_id FROM guild_log_channels WHERE guild_id=%s"
            cursor.execute(sql, (guild_id,))
            result = cursor.fetchone()
            return result[0] if result else None
    finally:
        conn.close()

async def on_message_edit(before: discord.Message, after: discord.Message):
    # Ignore bots
    if before.author.bot:
        return
    
    # Ignore if content hasn't changed (e.g. embed update, pin, etc.)
    if before.content == after.content:
        return

    guild: Optional[discord.Guild] = before.guild
    if guild is None:
        return

    guild_id = guild.id
    log_channel_id = get_log_channel(guild_id)
    
    if not log_channel_id:
        return

    channel = guild.get_channel(log_channel_id)
    if channel and isinstance(channel, discord.abc.Messageable):
        embed = discord.Embed(title=get_translation("message_edited_title", guild_id), color=discord.Color.orange(), timestamp=datetime.now())
        embed.set_author(name=before.author.display_name, icon_url=before.author.avatar.url if before.author.avatar else None)
        
        before_content = before.content if before.content else get_translation("no_text_content", guild_id)
        after_content = after.content if after.content else get_translation("no_text_content", guild_id)
        
        if len(before_content) > 1024:
            before_content = before_content[:1021] + "..."
        if len(after_content) > 1024:
            after_content = after_content[:1021] + "..."

        channel_label = get_translation("unknown_channel", guild_id)
        if isinstance(before.channel, (discord.TextChannel, discord.Thread, discord.VoiceChannel, discord.StageChannel, discord.ForumChannel)):
            channel_label = before.channel.mention

        embed.add_field(name=get_translation("original_message", guild_id), value=before_content, inline=False)
        embed.add_field(name=get_translation("modified_message", guild_id), value=after_content, inline=False)
        embed.add_field(name=get_translation("channel", guild_id), value=channel_label, inline=True)
        embed.add_field(name=get_translation("jump_to_message", guild_id), value=f"[Jump]({after.jump_url})", inline=True)
        embed.set_footer(text=f"User ID: {before.author.id}")
        
        try:
            await channel.send(embed=embed)
        except discord.Forbidden:
            logger.warning(f"Missing permission to send log to channel {log_channel_id} in guild {guild_id}")
        except Exception as e:
            logger.error(f"Failed to send edit log: {e}")


async def on_message_delete(message: discord.Message):
    # Ignore bots and DMs
    if message.author.bot:
        return

    guild: Optional[discord.Guild] = message.guild
    if guild is None:
        return

    guild_id = guild.id
    log_channel_id = get_log_channel(guild_id)
    if not log_channel_id:
        return

    channel = guild.get_channel(log_channel_id)
    if not channel or not isinstance(channel, discord.abc.Messageable):
        return

    content = message.content if message.content else get_translation("no_text_content", guild_id)
    if len(content) > 1024:
        content = content[:1021] + "..."

    attachment_info = []
    for att in message.attachments:
        attachment_info.append(f"{att.filename} ({att.url})")
    attachments_text = "\n".join(attachment_info) if attachment_info else "None"

    channel_label = get_translation("unknown_channel", guild_id)
    if isinstance(message.channel, (discord.TextChannel, discord.Thread, discord.VoiceChannel, discord.StageChannel, discord.ForumChannel)):
        channel_label = message.channel.mention

    embed = discord.Embed(title=get_translation("message_deleted_title", guild_id), color=discord.Color.red(), timestamp=datetime.now())
    embed.set_author(name=message.author.display_name, icon_url=message.author.avatar.url if message.author.avatar else None)
    embed.add_field(name=get_translation("original_message", guild_id), value=content, inline=False)
    embed.add_field(name=get_translation("channel", guild_id), value=channel_label, inline=True)
    embed.add_field(name=get_translation("attachments", guild_id), value=attachments_text, inline=False)
    embed.set_footer(text=f"User ID: {message.author.id}")

    try:
        await channel.send(embed=embed)
    except discord.Forbidden:
        logger.warning(get_translation("warn_missing_permission", guild_id).replace("{log_channel_id}", str(log_channel_id)).replace("{guild_id}", str(guild_id)))
    except Exception as e:
        logger.error(get_translation("error_failed_to_send_delete_log", guild_id).replace("{error}", str(e)))