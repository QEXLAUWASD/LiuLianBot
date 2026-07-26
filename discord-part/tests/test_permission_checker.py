from types import SimpleNamespace

import pytest

from commands.permission_checker import PermissionChecker


@pytest.fixture(autouse=True)
def stub_translations(monkeypatch):
    monkeypatch.setattr(
        "commands.permission_checker.get_translation",
        lambda key, _guild_id: key,
    )


class StubHandler:
    def __init__(self, command_type, *, owners=(), admins=(), guild_admins=()):
        self.command_type = command_type
        self.bot_owners = set(owners)
        self.bot_admins = set(admins)
        self.guild_admins = set(guild_admins)

    def get_command_type(self, _command_name):
        return self.command_type

    def is_guild_admin(self, _guild_id, user_id):
        return user_id in self.guild_admins


def make_member(user_id, *, guild_owner_id=99, administrator=False):
    return SimpleNamespace(
        id=user_id,
        guild=SimpleNamespace(id=10, owner_id=guild_owner_id),
        guild_permissions=SimpleNamespace(administrator=administrator),
    )


@pytest.mark.parametrize("command_type", ["owner", "guild_owner", "admin", "guild_admin", "user"])
def test_bot_owner_inherits_every_command_type(command_type):
    checker = PermissionChecker(StubHandler(command_type, owners={"1"}))

    assert checker.check_permission("command", make_member(1)) == (True, "")


@pytest.mark.parametrize("command_type", ["admin", "guild_admin", "user"])
def test_bot_admin_inherits_cross_guild_admin_commands(command_type):
    checker = PermissionChecker(StubHandler(command_type, admins={"2"}))

    assert checker.check_permission("command", make_member(2)) == (True, "")


@pytest.mark.parametrize("command_type", ["guild_owner", "admin", "guild_admin", "user"])
def test_guild_owner_inherits_guild_commands(command_type):
    checker = PermissionChecker(StubHandler(command_type))

    assert checker.check_permission("command", make_member(3, guild_owner_id=3)) == (True, "")


def test_bot_admin_cannot_run_owner_or_guild_owner_commands():
    member = make_member(2)

    for command_type in ("owner", "guild_owner"):
        checker = PermissionChecker(StubHandler(command_type, admins={"2"}))
        allowed, _ = checker.check_permission("command", member)
        assert not allowed
