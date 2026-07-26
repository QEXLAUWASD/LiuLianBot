from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest


def test_self_role_repository_uses_configured_roles_only():
    from features.self_roles.repository import SelfRoleRepository

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = [(123, "PC"), (456, "Console")]
    repo = SelfRoleRepository(connection_factory=MagicMock(return_value=connection))

    assert repo.list_roles(99) == [(123, "PC"), (456, "Console")]
    cursor.execute.assert_called_once_with(
        "SELECT role_id, role_name FROM guild_self_roles WHERE guild_id=%s ORDER BY role_name",
        (99,),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("permission_name", ["administrator", "manage_roles"])
async def test_set_self_role_rejects_privileged_roles(permission_name):
    from commands.guild_admin.setselfrole import setselfrole

    permissions = SimpleNamespace(administrator=False, manage_roles=False)
    setattr(permissions, permission_name, True)
    role = SimpleNamespace(
        is_default=lambda: False,
        managed=False,
        permissions=permissions,
    )
    message = SimpleNamespace(
        guild=SimpleNamespace(id=99),
        role_mentions=[role],
    )

    result = await setselfrole(message, SimpleNamespace())

    assert "不可供成員自助選擇" in result


@pytest.mark.asyncio
async def test_role_revalidates_privileges_when_member_claims_role(monkeypatch):
    from commands.user.role import role
    from features.self_roles.repository import SelfRoleRepository

    target = SimpleNamespace(
        permissions=SimpleNamespace(administrator=True, manage_roles=False),
    )
    guild = SimpleNamespace(id=99, get_role=lambda _role_id: target)
    author = SimpleNamespace(roles=[], add_roles=AsyncMock(), remove_roles=AsyncMock())
    message = SimpleNamespace(content=">role 123", guild=guild, author=author)
    monkeypatch.setattr(SelfRoleRepository, "list_roles", lambda self, guild_id: [(123, "Admin")])

    result = await role(message, SimpleNamespace())

    assert "包含高權限" in result
    author.add_roles.assert_not_awaited()
