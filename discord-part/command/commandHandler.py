import importlib
import inspect
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Optional, List, Tuple, Callable
from command.permission_checker import PermissionChecker

if TYPE_CHECKING:
    import discord

class CommandHandler:
    def __init__(self) -> None:
        self.commands = {}
        self.command_types = {}  # Store command type (admin/owner/user)
        self.bot_owners = set()  # Store bot owner IDs
        self.bot_admins = set()  # Store bot admin IDs
        self.guild_admins = {}  # Store guild-specific admin IDs {guild_id: set(user_ids)}
        self.permission_checker = PermissionChecker(self)  # Initialize permission checker
        self.load_commands()
    
    def load_commands(self) -> None:
        """Load all command functions from commands/commands folder"""
        commands_dir = Path(__file__).parent / 'commands'
        
        if not commands_dir.exists():
            print(f"Commands directory not found: {commands_dir}")
            return
        
        # Add parent directory to sys.path for imports
        parent_dir = Path(__file__).parent.parent
        if str(parent_dir) not in sys.path:
            sys.path.insert(0, str(parent_dir))
        
        # Iterate through subdirectories (admin, owner, user)
        for category_dir in commands_dir.iterdir():
            if not category_dir.is_dir() or category_dir.name.startswith('__'):
                continue
            
            command_type = category_dir.name  # 'admin', 'owner', or 'user'
            
            # Iterate through all Python files in each category folder
            for file_path in category_dir.glob('*.py'):
                if file_path.name.startswith('__'):
                    continue
                
                # Import the module
                module_name = f"command.commands.{command_type}.{file_path.stem}"
                try:
                    module = importlib.import_module(module_name)
                    
                    # Get all functions from the module
                    for name, obj in inspect.getmembers(module):
                        # Only load functions that don't start with _ and are async (command functions)
                        # Also exclude imported functions from other modules
                        if (inspect.isfunction(obj) and 
                            not name.startswith('_') and 
                            obj.__module__ == module.__name__):
                            self.commands[name] = obj
                            self.command_types[name] = command_type
                            print(f"Loaded {command_type} command: {name}")
                
                except Exception as e:
                    print(f"Error loading {file_path.name}: {e}")
    
    def add_bot_owner(self, owner_id: str) -> None:
        """Add a bot owner ID"""
        self.bot_owners.add(owner_id)
    
    def add_bot_admin(self, admin_id: str) -> None:
        """Add a bot admin ID"""
        self.bot_admins.add(admin_id)
    
    def add_guild_admin(self, guild_id: int, user_id: str) -> None:
        """Add a guild-specific admin"""
        if guild_id not in self.guild_admins:
            self.guild_admins[guild_id] = set()
        self.guild_admins[guild_id].add(user_id)
    
    def remove_guild_admin(self, guild_id: int, user_id: str) -> bool:
        """Remove a guild-specific admin. Returns True if removed, False if not found"""
        if guild_id in self.guild_admins and user_id in self.guild_admins[guild_id]:
            self.guild_admins[guild_id].remove(user_id)
            return True
        return False
    
    def get_guild_admins(self, guild_id: int) -> set:
        """Get all admin IDs for a specific guild"""
        return self.guild_admins.get(guild_id, set())
    
    def is_guild_admin(self, guild_id: int, user_id: str) -> bool:
        """Check if a user is a guild admin"""
        return user_id in self.guild_admins.get(guild_id, set())
    
    def get_command(self, command_name) -> Optional[Callable]:
        """Get a command function by name"""
        return self.commands.get(command_name)
    
    def list_commands(self) -> List[str]:
        """Return list of all available commands"""
        return list(self.commands.keys())
    
    def is_admin_command(self, command_name: str) -> bool:
        """Check if a command is an admin command"""
        return self.command_types.get(command_name) == 'admin'
    
    def is_owner_command(self, command_name: str) -> bool:
        """Check if a command is an owner command"""
        return self.command_types.get(command_name) == 'owner'
    
    def is_user_command(self, command_name: str) -> bool:
        """Check if a command is a user command"""
        return self.command_types.get(command_name) == 'user'
    
    def is_guild_admin_command(self, command_name: str) -> bool:
        """Check if a command is a guild admin command"""
        return self.command_types.get(command_name) == 'guild_admin'
    
    def is_guild_owner_command(self, command_name: str) -> bool:
        """Check if a command is a guild owner command"""
        return self.command_types.get(command_name) == 'guild_owner'
    
    def get_command_type(self, command_name: str) -> Optional[str]:
        """Get the type of a command (admin/owner/user)"""
        return self.command_types.get(command_name)
    
    def check_permission(self, command_name: str, member: 'discord.Member', bot_owner_id: Optional[int] = None) -> Tuple[bool, str]:
        """
        Check if a member has permission to run a command
        
        Args:
            command_name: The name of the command to check
            member: The Discord member attempting to run the command
            bot_owner_id: The Discord user ID of the bot owner (optional, deprecated)
        
        Returns:
            tuple: (has_permission: bool, error_message: str)
        """
        # Delegate to permission checker
        return self.permission_checker.check_permission(command_name, member)
    
    def get_permission_level(self, member: 'discord.Member') -> str:
        """
        Get the highest permission level for a member
        
        Args:
            member: The Discord member to check
        
        Returns:
            str: Permission level ('owner', 'guild_owner', 'admin', 'guild_admin', 'user')
        """
        return self.permission_checker.get_permission_level(member)
    
    def add_bot_owner(self, owner_id: str) -> None:
        """Add a bot owner ID to the handler"""
        if not hasattr(self, 'bot_owners'):
            self.bot_owners = set()
        self.bot_owners.add(owner_id)

    def add_bot_admin(self, admin_id: str) -> None:
        """Add a bot admin ID to the handler"""
        if not hasattr(self, 'bot_admins'):
            self.bot_admins = set()
        self.bot_admins.add(admin_id)

# Create a global instance
handler = CommandHandler()