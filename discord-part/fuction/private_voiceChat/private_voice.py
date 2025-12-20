import discord
from typing import Dict, Optional
import asyncio

import pymysql
import json
import os

# 讀取 config.json 取得 MySQL 設定
CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'config.json')
with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
    config = json.load(f)
MYSQL_CONFIG = config.get('mysql_config', {})

def get_db_conn():
    return pymysql.connect(**MYSQL_CONFIG)

def init_private_voice_table():
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS private_voice_channels (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guild_id BIGINT NOT NULL,
                    channel_id BIGINT NOT NULL,
                    owner_id BIGINT NOT NULL,
                    config_json JSON,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            ''')
        conn.commit()
    finally:
        conn.close()



# 啟動時自動初始化資料表
init_private_voice_table()

def save_private_channel_config(guild_id, channel_id, owner_id, config_dict):
    print(f"[DEBUG] Saving to MySQL: guild_id={guild_id}, channel_id={channel_id}, owner_id={owner_id}, config={config_dict}")
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            sql = """
            INSERT INTO private_voice_channels (guild_id, channel_id, owner_id, config_json)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE config_json=VALUES(config_json), updated_at=NOW()
            """
            import json
            cursor.execute(sql, (guild_id, channel_id, owner_id, json.dumps(config_dict, ensure_ascii=False)))
        conn.commit()
    except Exception as e:
        print(f"[ERROR] MySQL save failed: {e}")
        raise
    finally:
        conn.close()

def get_private_channel_config(channel_id):
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            sql = "SELECT config_json FROM private_voice_channels WHERE channel_id=%s"
            cursor.execute(sql, (channel_id,))
            result = cursor.fetchone()
            if result:
                import json
                return json.loads(result[0])
            return None
    finally:
        conn.close()

def update_private_channel_config(channel_id, config_dict):
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            sql = "UPDATE private_voice_channels SET config_json=%s, updated_at=NOW() WHERE channel_id=%s"
            import json
            cursor.execute(sql, (json.dumps(config_dict, ensure_ascii=False), channel_id))
        conn.commit()
    finally:
        conn.close()

def delete_private_channel_config(channel_id):
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            sql = "DELETE FROM private_voice_channels WHERE channel_id=%s"
            cursor.execute(sql, (channel_id,))
        conn.commit()
    finally:
        conn.close()


def cleanup_old_private_configs(retention_days: int = 30) -> int:
    """Remove private channel configs older than the retention window."""
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            sql = """
                DELETE FROM private_voice_channels
                WHERE JSON_EXTRACT(config_json, '$.type') = 'private'
                  AND updated_at < DATE_SUB(NOW(), INTERVAL %s DAY)
            """
            cursor.execute(sql, (retention_days,))
            deleted = cursor.rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()



class PrivateVoiceManager:
    def __init__(self, bot):
        self.bot = bot
        self.trigger_channels: Dict[int, int] = {}  # {guild_id: trigger_channel_id}
        self.private_channels: Dict[int, int] = {}  # {channel_id: owner_id}
        self.user_channels: Dict[int, int] = {}  # {user_id: channel_id}
        self.cleanup_task: Optional[asyncio.Task] = None
        self.cleanup_interval_seconds = 24 * 60 * 60
        self.load_trigger_channels_from_db()

    def start_cleanup_task(self, retention_days: int = 30):
        if self.cleanup_task is None:
            self.cleanup_task = self.bot.loop.create_task(
                self._cleanup_loop(retention_days)
            )

    async def _cleanup_loop(self, retention_days: int):
        while True:
            try:
                removed = cleanup_old_private_configs(retention_days)
                if removed:
                    print(f"[INFO] Removed {removed} stale private voice configs older than {retention_days} days")
            except Exception as e:
                print(f"[ERROR] Failed to cleanup private voice configs: {e}")
            await asyncio.sleep(self.cleanup_interval_seconds)

    def load_trigger_channels_from_db(self):
        conn = get_db_conn()
        try:
            with conn.cursor() as cursor:
                sql = "SELECT id, guild_id, channel_id, config_json FROM private_voice_channels WHERE JSON_EXTRACT(config_json, '$.type') = 'trigger' ORDER BY updated_at DESC"
                cursor.execute(sql)
                rows = cursor.fetchall()
                seen_guilds = set()
                duplicate_ids = []
                for row in rows:
                    id_, guild_id, channel_id, config_json = row
                    guild_id = int(guild_id)
                    channel_id = int(channel_id)
                    if guild_id not in seen_guilds:
                        self.trigger_channels[guild_id] = channel_id
                        seen_guilds.add(guild_id)
                    else:
                        duplicate_ids.append(id_)
                # 刪除重複的 trigger config
                if duplicate_ids:
                    format_ids = ','.join(str(i) for i in duplicate_ids)
                    del_sql = f"DELETE FROM private_voice_channels WHERE id IN ({format_ids})"
                    cursor.execute(del_sql)
                    conn.commit()
                    print(f"[INFO] Removed duplicate trigger configs: {duplicate_ids}")
        finally:
            conn.close()

    def set_trigger_channel(self, guild_id: int, channel_id: int):
        self.trigger_channels[guild_id] = channel_id

    def remove_trigger_channel(self, guild_id: int):
        if guild_id in self.trigger_channels:
            del self.trigger_channels[guild_id]

    def get_trigger_channel(self, guild_id: int) -> Optional[int]:
        return self.trigger_channels.get(guild_id)

    def save_channel_config(self, guild_id, channel_id, owner_id, config_dict):
        save_private_channel_config(guild_id, channel_id, owner_id, config_dict)

    def get_channel_config(self, channel_id):
        return get_private_channel_config(channel_id)

    def update_channel_config(self, channel_id, config_dict):
        update_private_channel_config(channel_id, config_dict)

    def delete_channel_config(self, channel_id):
        delete_private_channel_config(channel_id)

    async def on_voice_state_update(self, member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
        """Handle voice state updates"""
        # User joined a voice channel
        if after.channel and after.channel.id == self.trigger_channels.get(member.guild.id):
            await self.create_private_channel(member, after.channel)
        
        # User left a private channel
        if before.channel and before.channel.id in self.private_channels:
            await self.check_and_delete_channel(before.channel)
    
    async def create_private_channel(self, member: discord.Member, trigger_channel: discord.VoiceChannel):
        """Create a private voice channel for the user"""
        # Check if user already has a private channel
        if member.id in self.user_channels:
            existing_channel = member.guild.get_channel(self.user_channels[member.id])
            if existing_channel:
                try:
                    await member.move_to(existing_channel)
                    return
                except:
                    pass
        
        # Create new private channel
        try:
            # Get the category of the trigger channel
            category = trigger_channel.category
            
            # Create the private channel
            private_channel = await member.guild.create_voice_channel(
                name=f"{member.display_name}'s Channel",
                category=category,
                reason=f"Private voice channel for {member}"
            )
            
            # Set permissions
            # Owner has full control
            await private_channel.set_permissions(
                member,
                connect=True,
                speak=True,
                manage_channels=True,
                move_members=True,
                mute_members=True,
                deafen_members=True
            )
            
            # Everyone else can connect but with limited permissions
            await private_channel.set_permissions(
                member.guild.default_role,
                connect=True,
                speak=True
            )
            
            # Move the user to the new channel
            await member.move_to(private_channel)
            
            # Track the channel
            self.private_channels[private_channel.id] = member.id
            self.user_channels[member.id] = private_channel.id
            # 寫入 MySQL
            self.save_channel_config(member.guild.id, private_channel.id, member.id, {"type": "private", "name": private_channel.name})
            
        except discord.Forbidden:
            print(f"Missing permissions to create voice channel in {member.guild.name}")
        except discord.HTTPException as e:
            print(f"Failed to create private voice channel: {e}")
    
    async def check_and_delete_channel(self, channel: discord.VoiceChannel):
        """Check if a private channel is empty and delete it"""
        # Wait a bit to ensure the user has fully left
        await asyncio.sleep(1)
        
        # Check if channel still exists and is empty
        if channel and len(channel.members) == 0:
            if channel.id in self.private_channels:
                try:
                    owner_id = self.private_channels[channel.id]
                    
                    # Remove from tracking
                    del self.private_channels[channel.id]
                    if owner_id in self.user_channels:
                        del self.user_channels[owner_id]
                    
                    # Delete the channel
                    await channel.delete(reason="Private voice channel is empty")
                    
                except discord.Forbidden:
                    print(f"Missing permissions to delete voice channel {channel.name}")
                except discord.HTTPException as e:
                    print(f"Failed to delete private voice channel: {e}")
    
    async def cleanup_empty_channels(self):
        """Cleanup any empty private channels (run periodically)"""
        channels_to_delete = []
        
        for channel_id, owner_id in list(self.private_channels.items()):
            channel = self.bot.get_channel(channel_id)
            if channel:
                if len(channel.members) == 0:
                    channels_to_delete.append(channel)
            else:
                # Channel no longer exists
                del self.private_channels[channel_id]
                if owner_id in self.user_channels:
                    del self.user_channels[owner_id]
        
        # Delete empty channels
        for channel in channels_to_delete:
            await self.check_and_delete_channel(channel)


# Global instance
private_voice_manager = None


def get_manager(bot):
    """Get or create the private voice manager instance"""
    global private_voice_manager
    if private_voice_manager is None:
        private_voice_manager = PrivateVoiceManager(bot)
    return private_voice_manager
