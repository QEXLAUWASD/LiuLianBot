import json
from unittest.mock import MagicMock, call

import pytest

from features.private_voice_chat.repository import PrivateVoiceRepository


def make_repo():
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    return PrivateVoiceRepository(lambda: connection), connection, cursor


def test_save_trigger_serializes_config_and_uses_one_trigger_key_per_guild():
    repository, connection, cursor = make_repo()

    repository.save(10, 20, 30, {"type": "trigger", "name": "觸發器"})

    sql, params = cursor.execute.call_args.args
    assert "trigger_guild_id" in sql
    assert "ON DUPLICATE KEY UPDATE" in sql
    assert params == (
        10,
        20,
        30,
        json.dumps({"type": "trigger", "name": "觸發器"}, ensure_ascii=False),
        "trigger",
        10,
    )
    connection.commit.assert_called_once_with()
    connection.close.assert_called_once_with()


def test_save_private_channel_has_no_trigger_guild_id():
    repository, connection, cursor = make_repo()

    repository.save(10, 20, 30, {"name": "Private"})

    params = cursor.execute.call_args.args[1]
    assert params[4:] == ("private", None)
    connection.commit.assert_called_once_with()
    connection.close.assert_called_once_with()


def test_save_closes_connection_when_execute_fails():
    repository, connection, cursor = make_repo()
    cursor.execute.side_effect = RuntimeError("write failed")

    with pytest.raises(RuntimeError, match="write failed"):
        repository.save(10, 20, 30, {"type": "private"})

    connection.commit.assert_not_called()
    connection.close.assert_called_once_with()


def test_remove_trigger_deletes_persisted_row():
    repository, connection, cursor = make_repo()

    repository.remove_trigger(10)

    cursor.execute.assert_called_once_with(
        "DELETE FROM private_voice_channels WHERE guild_id=%s AND config_type='trigger'",
        (10,),
    )
    connection.commit.assert_called_once_with()
    connection.close.assert_called_once_with()


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        (json.dumps({"name": "頻道", "limit": 5}, ensure_ascii=False), {"name": "頻道", "limit": 5}),
        (None, None),
    ],
)
def test_get_config_deserializes_json_and_closes(stored, expected):
    repository, connection, cursor = make_repo()
    cursor.fetchone.return_value = (stored,) if stored is not None else None

    result = repository.get_config(20)

    cursor.execute.assert_called_once_with(
        "SELECT config_json FROM private_voice_channels WHERE channel_id=%s",
        (20,),
    )
    assert result == expected
    connection.close.assert_called_once_with()


def test_update_config_serializes_json_commits_and_closes():
    repository, connection, cursor = make_repo()
    config = {"name": "私人頻道", "limit": 8}

    repository.update_config(20, config)

    cursor.execute.assert_called_once_with(
        "UPDATE private_voice_channels SET config_json=%s, updated_at=NOW() "
        "WHERE channel_id=%s",
        (json.dumps(config, ensure_ascii=False), 20),
    )
    connection.commit.assert_called_once_with()
    connection.close.assert_called_once_with()


def test_delete_commits_and_closes():
    repository, connection, cursor = make_repo()

    repository.delete(20)

    cursor.execute.assert_called_once_with(
        "DELETE FROM private_voice_channels WHERE channel_id=%s",
        (20,),
    )
    connection.commit.assert_called_once_with()
    connection.close.assert_called_once_with()


def test_update_owner_commits_and_closes():
    repository, connection, cursor = make_repo()

    repository.update_owner(20, 99)

    cursor.execute.assert_called_once_with(
        "UPDATE private_voice_channels SET owner_id=%s, updated_at=NOW() WHERE channel_id=%s",
        (99, 20),
    )
    connection.commit.assert_called_once_with()
    connection.close.assert_called_once_with()


def test_load_triggers_returns_integer_mapping_and_closes():
    repository, connection, cursor = make_repo()
    cursor.fetchall.return_value = [("10", "20"), (30, 40)]

    result = repository.load_triggers()

    cursor.execute.assert_called_once_with(
        "SELECT guild_id, channel_id FROM private_voice_channels WHERE config_type='trigger'"
    )
    assert result == {10: 20, 30: 40}
    connection.close.assert_called_once_with()


def test_cleanup_old_only_deletes_private_rows_and_returns_rowcount():
    repository, connection, cursor = make_repo()
    cursor.rowcount = 3

    result = repository.cleanup_old(30)

    cursor.execute.assert_called_once_with(
        "DELETE FROM private_voice_channels WHERE config_type='private' "
        "AND updated_at < DATE_SUB(NOW(), INTERVAL %s DAY)",
        (30,),
    )
    assert result == 3
    connection.commit.assert_called_once_with()
    connection.close.assert_called_once_with()


def test_manager_uses_injected_repository_for_persistence():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    bot = MagicMock()
    repository = MagicMock()
    repository.load_triggers.return_value = {10: 20}
    manager = PrivateVoiceManager(bot, repository=repository)

    assert manager.trigger_channels == {10: 20}
    manager.save_channel_config(10, 21, 30, {"type": "private"})
    assert manager.get_channel_config(21) is repository.get_config.return_value
    manager.update_channel_config(21, {"limit": 5})
    manager.delete_channel_config(21)
    manager.private_channels[21] = 30
    manager.user_channels[30] = 21
    manager.transfer_channel_owner(21, 31)
    manager._cleanup_once(14)

    assert repository.mock_calls == [
        call.load_triggers(),
        call.save(10, 21, 30, {"type": "private"}),
        call.get_config(21),
        call.update_config(21, {"limit": 5}),
        call.delete(21),
        call.update_owner(21, 31),
        call.cleanup_old(14),
    ]


def test_remove_trigger_persists_before_popping_memory_cache():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    events = []
    repository = MagicMock()
    repository.load_triggers.return_value = {10: 20}
    repository.remove_trigger.side_effect = lambda guild_id: events.append(
        ("repository", guild_id)
    )
    manager = PrivateVoiceManager(MagicMock(), repository=repository)

    class RecordingCache(dict):
        def pop(self, key, default=None):
            events.append(("cache", key))
            return super().pop(key, default)

    manager.trigger_channels = RecordingCache(manager.trigger_channels)
    manager.remove_trigger_channel(10)

    assert events == [("repository", 10), ("cache", 10)]
    assert manager.trigger_channels == {}
