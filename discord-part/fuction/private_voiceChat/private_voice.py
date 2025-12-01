import discord
from typing import Dict, Optional
import asyncio


class PrivateVoiceManager:
    def __init__(self, bot):
        self.bot = bot
        self.trigger_channels: Dict[int, int] = {}  # {guild_id: trigger_channel_id}
        self.private_channels: Dict[int, int] = {}  # {channel_id: owner_id}
        self.user_channels: Dict[int, int] = {}  # {user_id: channel_id}
    
    def set_trigger_channel(self, guild_id: int, channel_id: int):
        """Set the trigger channel for a guild"""
        self.trigger_channels[guild_id] = channel_id
    
    def remove_trigger_channel(self, guild_id: int):
        """Remove the trigger channel for a guild"""
        if guild_id in self.trigger_channels:
            del self.trigger_channels[guild_id]
    
    def get_trigger_channel(self, guild_id: int) -> Optional[int]:
        """Get the trigger channel ID for a guild"""
        return self.trigger_channels.get(guild_id)
    
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
