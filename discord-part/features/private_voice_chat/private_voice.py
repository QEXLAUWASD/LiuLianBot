import discord
from typing import Dict, Optional
import asyncio

from features.private_voice_chat.repository import PrivateVoiceRepository



class PrivateVoiceManager:
    def __init__(self, bot, repository=None):
        self.bot = bot
        self.repository = (
            repository if repository is not None else PrivateVoiceRepository()
        )
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
                removed = self._cleanup_once(retention_days)
                if removed:
                    print(f"[INFO] Removed {removed} stale private voice configs older than {retention_days} days")
            except Exception as e:
                print(f"[ERROR] Failed to cleanup private voice configs: {e}")
            await asyncio.sleep(self.cleanup_interval_seconds)

    def _cleanup_once(self, retention_days: int) -> int:
        return self.repository.cleanup_old(retention_days)

    def load_trigger_channels_from_db(self):
        self.trigger_channels = self.repository.load_triggers()

    def set_trigger_channel(self, guild_id: int, channel_id: int):
        self.trigger_channels[guild_id] = channel_id

    def remove_trigger_channel(self, guild_id: int) -> None:
        self.repository.remove_trigger(guild_id)
        self.trigger_channels.pop(guild_id, None)

    def get_trigger_channel(self, guild_id: int) -> Optional[int]:
        return self.trigger_channels.get(guild_id)

    def save_channel_config(self, guild_id, channel_id, owner_id, config_dict):
        self.repository.save(guild_id, channel_id, owner_id, config_dict)

    def get_channel_config(self, channel_id):
        return self.repository.get_config(channel_id)

    def update_channel_config(self, channel_id, config_dict):
        self.repository.update_config(channel_id, config_dict)

    def delete_channel_config(self, channel_id):
        self.repository.delete(channel_id)

    def transfer_channel_owner(self, channel_id: int, new_owner_id: int):
        """Update in-memory tracking and DB when channel ownership is transferred."""
        old_owner_id = self.private_channels.get(channel_id)
        self.private_channels[channel_id] = new_owner_id
        if old_owner_id is not None and self.user_channels.get(old_owner_id) == channel_id:
            del self.user_channels[old_owner_id]
        self.user_channels[new_owner_id] = channel_id
        self.repository.update_owner(channel_id, new_owner_id)

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
