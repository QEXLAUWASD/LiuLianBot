import inspect
from collections import Counter

import pytest

from commands.handler import CommandHandler


@pytest.fixture(scope="module")
def command_handler():
    return CommandHandler()


def test_loaded_commands_are_coroutine_functions(command_handler):
    assert all(
        inspect.iscoroutinefunction(command)
        for command in command_handler.commands.values()
    )


def test_loaded_command_inventory_excludes_sync_helpers(command_handler):
    assert "resolve_voice_channel" not in command_handler.commands
    assert "setprivatevoice" in command_handler.commands
    assert len(command_handler.commands) == 35


def test_loaded_commands_keep_permission_categories(command_handler):
    assert Counter(command_handler.command_types.values()) == {
        "guild_admin": 10,
        "guild_owner": 3,
        "owner": 6,
        "user": 16,
    }
    assert command_handler.get_command_type("setprivatevoice") == "guild_admin"
