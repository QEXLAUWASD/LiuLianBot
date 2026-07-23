import json
from unittest.mock import MagicMock, call

import pytest

from features.private_voice_chat.repository import PrivateVoiceRepository


def make_repo():
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    return PrivateVoiceRepository(lambda: connection), connection, cursor


def test_save_trigger_removes_old_guild_trigger_before_upserting_target_channel():
    repository, connection, cursor = make_repo()
    config = {"type": "trigger", "name": "觸發器"}

    repository.save(10, 20, 30, config)

    upsert_sql = cursor.execute.call_args_list[1].args[0]
    assert cursor.execute.call_args_list == [
        call(
            "DELETE FROM private_voice_channels WHERE guild_id=%s "
            "AND config_type='trigger' AND channel_id<>%s",
            (10, 20),
        ),
        call(
            upsert_sql,
            (10, 20, 30, json.dumps(config, ensure_ascii=False), "trigger", 10),
        ),
    ]
    assert "trigger_guild_id" in upsert_sql
    assert "ON DUPLICATE KEY UPDATE" in upsert_sql
    connection.commit.assert_called_once_with()
    connection.rollback.assert_not_called()
    connection.close.assert_called_once_with()


def test_save_trigger_rolls_back_and_closes_when_upsert_fails():
    repository, connection, cursor = make_repo()
    error = RuntimeError("upsert failed")
    cursor.execute.side_effect = [None, error]

    with pytest.raises(RuntimeError, match="upsert failed"):
        repository.save(10, 20, 30, {"type": "trigger"})

    assert cursor.execute.call_count == 2
    connection.rollback.assert_called_once_with()
    connection.commit.assert_not_called()
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


@pytest.mark.parametrize(
    ("config", "config_type"),
    [
        ({"name": "私人頻道", "limit": 8}, "private"),
        ({"type": "trigger", "name": "觸發頻道"}, "trigger"),
        ({"type": "custom", "name": "自訂頻道"}, "custom"),
    ],
)
def test_update_config_synchronizes_type_columns_and_closes(config, config_type):
    repository, connection, cursor = make_repo()

    repository.update_config(20, config)

    cursor.execute.assert_called_once_with(
        "UPDATE private_voice_channels SET config_json=%s, config_type=%s, "
        "trigger_guild_id=CASE WHEN %s='trigger' THEN guild_id ELSE NULL END, "
        "updated_at=NOW() "
        "WHERE channel_id=%s",
        (json.dumps(config, ensure_ascii=False), config_type, config_type, 20),
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


def test_manager_does_not_change_trigger_cache_when_persistence_fails():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    repository = MagicMock()
    repository.load_triggers.return_value = {10: 20}
    repository.save.side_effect = RuntimeError("database unavailable")
    manager = PrivateVoiceManager(MagicMock(), repository=repository)

    with pytest.raises(RuntimeError, match="database unavailable"):
        manager.save_channel_config(10, 21, 30, {"type": "trigger"})

    assert manager.trigger_channels == {10: 20}


def test_manager_updates_trigger_cache_after_persistence_succeeds():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    events = []
    repository = MagicMock()
    repository.load_triggers.return_value = {10: 20}
    repository.save.side_effect = lambda *args: events.append("repository")
    manager = PrivateVoiceManager(MagicMock(), repository=repository)

    class RecordingCache(dict):
        def __setitem__(self, key, value):
            events.append("cache")
            return super().__setitem__(key, value)

    manager.trigger_channels = RecordingCache(manager.trigger_channels)
    manager.save_channel_config(10, 21, 30, {"type": "trigger"})

    assert events == ["repository", "cache"]
    assert manager.trigger_channels == {10: 21}


async def test_set_private_voice_command_does_not_prewrite_trigger_cache(monkeypatch):
    from commands.guild_admin import set_private_voice

    class FakeVoiceChannel:
        id = 20
        name = "Trigger"
        mention = "<#20>"
        category = None

    manager = MagicMock()
    message = MagicMock()
    message.content = ">setprivatevoice 20"
    message.channel_mentions = []
    message.guild.id = 10
    message.guild.get_channel.return_value = FakeVoiceChannel()
    message.author.id = 30
    message.author.display_avatar = None
    monkeypatch.setattr(set_private_voice.discord, "VoiceChannel", FakeVoiceChannel)
    monkeypatch.setattr(set_private_voice, "get_manager", MagicMock(return_value=manager))
    monkeypatch.setattr(set_private_voice, "get_translation", lambda key, guild_id: key)

    await set_private_voice.setprivatevoice(message, MagicMock())

    manager.set_trigger_channel.assert_not_called()
    manager.save_channel_config.assert_called_once_with(
        10,
        20,
        30,
        {"type": "trigger"},
    )


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
