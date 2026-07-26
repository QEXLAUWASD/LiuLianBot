"""
Permission checker for Discord bot commands
Handles all permission level checks for different command types
"""
from typing import TYPE_CHECKING, Tuple
from commands.language_manager import get_translation

if TYPE_CHECKING:
    import discord


class PermissionChecker:
    """Handle permission checks for commands"""
    
    def __init__(self, handler):
        """
        Initialize permission checker
        
        Args:
            handler: Reference to CommandHandler instance
        """
        self.handler = handler
    
    def check_permission(self, command_name: str, member: 'discord.Member') -> Tuple[bool, str]:
        """
        Check if a member has permission to run a command
        
        Args:
            command_name: The name of the command to check
            member: The Discord member attempting to run the command
        
        Returns:
            tuple: (has_permission: bool, error_message: str)
        """
        command_type = self.handler.get_command_type(command_name)
        
        # Command doesn't exist
        if command_type is None:
            return False, get_translation("cmd_not_found", None).replace("{command}", command_name)

        # Bot owners inherit every command capability.
        if self._is_bot_owner(member):
            return True, ""
        
        # Check based on command type
        if command_type == 'owner':
            return self._check_owner(member)
        elif command_type == 'guild_owner':
            return self._check_guild_owner(member)
        elif command_type == 'admin':
            return self._check_admin(member)
        elif command_type == 'guild_admin':
            return self._check_guild_admin(member)
        elif command_type == 'user':
            return self._check_user(member)
        
        # Unknown command type
        return False, get_translation("unknown_command_type", None).replace("{type}", command_type)
    
    def _check_owner(self, member: 'discord.Member') -> Tuple[bool, str]:
        """Check if member is a bot owner"""
        if not self._is_bot_owner(member):
            gid = member.guild.id if hasattr(member, 'guild') and member.guild else None
            return False, get_translation("owner_only", gid)
        return True, ""
    
    def _check_guild_owner(self, member: 'discord.Member') -> Tuple[bool, str]:
        """Check if member is the guild owner"""
        if not hasattr(member, 'guild') or not member.guild:
            return False, get_translation("must_be_in_guild", None)
        
        if member.guild.owner_id != member.id:
            return False, get_translation("guild_owner_only", member.guild.id)
        return True, ""
    
    def _check_admin(self, member: 'discord.Member') -> Tuple[bool, str]:
        """Check if member has admin permissions (global or guild)"""
        if not (
            self._is_bot_admin(member)
            or self._is_guild_owner(member)
            or self._is_guild_admin(member)
            or self._is_server_admin(member)
        ):
            gid = member.guild.id if hasattr(member, 'guild') and member.guild else None
            return False, get_translation("require_admin", gid)
        return True, ""
    
    def _check_guild_admin(self, member: 'discord.Member') -> Tuple[bool, str]:
        """Check if member has guild admin permissions."""
        if not (
            self._is_bot_admin(member)
            or self._is_guild_owner(member)
            or self._is_guild_admin(member)
            or self._is_server_admin(member)
        ):
            gid = member.guild.id if hasattr(member, 'guild') and member.guild else None
            return False, get_translation("require_guild_admin", gid)
        return True, ""

    def _is_bot_owner(self, member: 'discord.Member') -> bool:
        return str(member.id) in self.handler.bot_owners

    def _is_bot_admin(self, member: 'discord.Member') -> bool:
        return str(member.id) in self.handler.bot_admins

    @staticmethod
    def _is_guild_owner(member: 'discord.Member') -> bool:
        return bool(
            hasattr(member, 'guild')
            and member.guild
            and member.guild.owner_id == member.id
        )

    def _is_guild_admin(self, member: 'discord.Member') -> bool:
        return bool(
            hasattr(member, 'guild')
            and member.guild
            and self.handler.is_guild_admin(member.guild.id, str(member.id))
        )

    @staticmethod
    def _is_server_admin(member: 'discord.Member') -> bool:
        return bool(
            hasattr(member, 'guild_permissions')
            and member.guild_permissions.administrator
        )
    
    def _check_user(self, member: 'discord.Member') -> Tuple[bool, str]:
        """Check if member can use user commands (always true)"""
        return True, ""
    
    def get_permission_level(self, member: 'discord.Member') -> str:
        """
        Get the highest permission level for a member
        
        Args:
            member: The Discord member to check
        
        Returns:
            str: The highest permission level ('owner', 'guild_owner', 'admin', 'guild_admin', 'user')
        """
        # Check bot owner
        if str(member.id) in self.handler.bot_owners:
            return 'owner'
        
        # Check guild owner
        if hasattr(member, 'guild') and member.guild and member.guild.owner_id == member.id:
            return 'guild_owner'
        
        # Check global admin
        if str(member.id) in self.handler.bot_admins:
            return 'admin'
        
        # Check guild admin
        if hasattr(member, 'guild') and member.guild:
            if self.handler.is_guild_admin(member.guild.id, str(member.id)):
                return 'guild_admin'
            
            # Check Discord server admin
            if hasattr(member, 'guild_permissions') and member.guild_permissions.administrator:
                return 'guild_admin'
        
        # Default to user
        return 'user'
