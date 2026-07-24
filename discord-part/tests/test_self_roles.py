from unittest.mock import MagicMock


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
