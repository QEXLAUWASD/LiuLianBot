import discord
from typing import Dict, Optional
import asyncio

from features.private_voice_chat.repository import PrivateVoiceRepository
from utils.async_io import run_blocking



class PrivateVoiceManager:
    def __init__(self, bot, repository=None):
        self.bot = bot
        self.repository = (
            repository if repository is not None else PrivateVoiceRepository()
        )
        self.trigger_channels: Dict[int, int] = {}  # {guild_id: trigger_channel_id}
        self.private_channels: Dict[int, int] = {}  # {channel_id: owner_id}
        self.channel_guilds: Dict[int, int] = {}  # {channel_id: guild_id}
        self.user_channels: Dict[tuple[int, int], int] = {}
        self.cleanup_task: Optional[asyncio.Task] = None
        self.cleanup_interval_seconds = 24 * 60 * 60

    async def initialize(self) -> None:
        triggers, private_channels = await asyncio.gather(
            run_blocking(self.repository.load_triggers),
            run_blocking(self.repository.load_private_channels),
        )
        self.trigger_channels = triggers
        self._load_private_channel_rows(private_channels)

    def start_cleanup_task(self):
        if self.cleanup_task is None:
            self.cleanup_task = self.bot.loop.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        while True:
            try:
                await self.cleanup_empty_channels()
            except Exception as e:
                print(f"[ERROR] Failed to cleanup private voice configs: {e}")
            await asyncio.sleep(self.cleanup_interval_seconds)

    def _load_private_channel_rows(self, rows):
        self.private_channels = {}
        self.channel_guilds = {}
        self.user_channels = {}
        for guild_id, channel_id, owner_id in rows:
            guild_id = int(guild_id)
            channel_id = int(channel_id)
            owner_id = int(owner_id)
            self.private_channels[channel_id] = owner_id
            self.channel_guilds[channel_id] = guild_id
            self.user_channels.setdefault((guild_id, owner_id), channel_id)

    async def remove_trigger_channel(self, guild_id: int) -> None:
        await run_blocking(self.repository.remove_trigger, guild_id)
        self.trigger_channels.pop(guild_id, None)

    def get_trigger_channel(self, guild_id: int) -> Optional[int]:
        return self.trigger_channels.get(guild_id)

    def get_user_channel(self, guild_id: int, user_id: int) -> Optional[int]:
        return self.user_channels.get((guild_id, user_id))

    async def save_channel_config(self, guild_id, channel_id, owner_id, config_dict):
        await run_blocking(
            self.repository.save,
            guild_id,
            channel_id,
            owner_id,
            config_dict,
        )
        if config_dict.get("type") == "trigger":
            self.trigger_channels[guild_id] = channel_id

    async def get_channel_config(self, channel_id):
        return await run_blocking(self.repository.get_config, channel_id)

    async def update_channel_config(self, channel_id, config_dict):
        await run_blocking(self.repository.update_config, channel_id, config_dict)

    async def delete_channel_config(self, channel_id):
        await run_blocking(self.repository.delete, channel_id)

    async def transfer_channel_owner(
        self,
        guild_id: int,
        channel_id: int,
        new_owner_id: int,
    ):
        """Update in-memory tracking and DB when channel ownership is transferred."""
        old_owner_id = self.private_channels.get(channel_id)
        await run_blocking(self.repository.update_owner, channel_id, new_owner_id)
        self.private_channels[channel_id] = new_owner_id
        if (
            old_owner_id is not None
            and self.user_channels.get((guild_id, old_owner_id)) == channel_id
        ):
            del self.user_channels[(guild_id, old_owner_id)]
        self.user_channels[(guild_id, new_owner_id)] = channel_id

    def _remove_private_channel_cache(self, channel_id: int, owner_id: int) -> None:
        guild_id = self.channel_guilds.get(channel_id)
        self.private_channels.pop(channel_id, None)
        self.channel_guilds.pop(channel_id, None)
        if (
            guild_id is not None
            and self.user_channels.get((guild_id, owner_id)) == channel_id
        ):
            self.user_channels.pop((guild_id, owner_id), None)

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
        existing_channel_id = self.get_user_channel(member.guild.id, member.id)
        if existing_channel_id is not None:
            existing_channel = member.guild.get_channel(existing_channel_id)
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
            
            try:
                await self.save_channel_config(
                    member.guild.id,
                    private_channel.id,
                    member.id,
                    {"type": "private", "name": private_channel.name},
                )
            except Exception:
                try:
                    await private_channel.delete(
                        reason="Private voice channel persistence failed"
                    )
                except Exception:
                    self.bot.logger.error(
                        "Private voice channel compensation failed after persistence error",
                        exc_info=True,
                    )
                raise
            self.private_channels[private_channel.id] = member.id
            self.channel_guilds[private_channel.id] = member.guild.id
            self.user_channels[(member.guild.id, member.id)] = private_channel.id
            
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
                    await channel.delete(reason="Private voice channel is empty")
                    await self.delete_channel_config(channel.id)
                    self._remove_private_channel_cache(channel.id, owner_id)
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
                await self.delete_channel_config(channel_id)
                self._remove_private_channel_cache(channel_id, owner_id)
        
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
