import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call

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
    cursor.rowcount = 1

    repository.update_owner(20, 99)

    cursor.execute.assert_called_once_with(
        "UPDATE private_voice_channels SET owner_id=%s, updated_at=NOW() WHERE channel_id=%s",
        (99, 20),
    )
    connection.commit.assert_called_once_with()
    connection.rollback.assert_not_called()
    connection.close.assert_called_once_with()


def test_update_owner_rolls_back_when_channel_row_is_missing():
    repository, connection, cursor = make_repo()
    cursor.rowcount = 0

    with pytest.raises(LookupError, match="Private voice channel 20 not found"):
        repository.update_owner(20, 99)

    connection.rollback.assert_called_once_with()
    connection.commit.assert_not_called()
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


def test_load_private_channels_preserves_newest_first_order_and_closes():
    repository, connection, cursor = make_repo()
    cursor.fetchall.return_value = [
        ("1", "101", "10"),
        (2, 201, 10),
        (1, 102, 10),
    ]

    result = repository.load_private_channels()

    cursor.execute.assert_called_once_with(
        "SELECT guild_id, channel_id, owner_id FROM private_voice_channels "
        "WHERE config_type='private' ORDER BY updated_at DESC, id DESC"
    )
    assert result == [(1, 101, 10), (2, 201, 10), (1, 102, 10)]
    connection.close.assert_called_once_with()


async def test_manager_uses_injected_repository_for_persistence():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    bot = MagicMock()
    repository = MagicMock()
    repository.load_triggers.return_value = {10: 20}
    repository.load_private_channels.return_value = []
    manager = PrivateVoiceManager(bot, repository=repository)
    await manager.initialize()

    assert manager.trigger_channels == {10: 20}
    await manager.save_channel_config(10, 21, 30, {"type": "private"})
    assert await manager.get_channel_config(21) is repository.get_config.return_value
    await manager.update_channel_config(21, {"limit": 5})
    await manager.delete_channel_config(21)
    manager.private_channels[21] = 30
    manager.channel_guilds[21] = 10
    manager.user_channels[(10, 30)] = 21
    await manager.transfer_channel_owner(10, 21, 31)

    assert repository.mock_calls == [
        call.load_triggers(),
        call.load_private_channels(),
        call.save(10, 21, 30, {"type": "private"}),
        call.get_config(21),
        call.update_config(21, {"limit": 5}),
        call.delete(21),
        call.update_owner(21, 31),
    ]


async def test_manager_restores_all_private_channels_and_newest_channel_per_owner():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    repository = MagicMock()
    repository.load_triggers.return_value = {1: 2}
    repository.load_private_channels.return_value = [
        (1, 101, 10),
        (2, 201, 10),
        (1, 102, 10),
        (2, 202, 10),
        (1, 103, 11),
    ]

    manager = PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()

    assert manager.trigger_channels == {1: 2}
    assert manager.private_channels == {
        101: 10,
        201: 10,
        102: 10,
        202: 10,
        103: 11,
    }
    assert manager.channel_guilds == {101: 1, 201: 2, 102: 1, 202: 2, 103: 1}
    assert manager.user_channels == {(1, 10): 101, (2, 10): 201, (1, 11): 103}
    assert manager.get_user_channel(1, 10) == 101
    assert manager.get_user_channel(2, 10) == 201


async def test_transfer_owner_in_one_guild_does_not_change_other_guild_mapping():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = [
        (1, 101, 10),
        (2, 201, 10),
    ]
    manager = PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()

    await manager.transfer_channel_owner(1, 101, 11)

    repository.update_owner.assert_called_once_with(101, 11)
    assert manager.private_channels == {101: 11, 201: 10}
    assert manager.channel_guilds == {101: 1, 201: 2}
    assert manager.user_channels == {(1, 11): 101, (2, 10): 201}


async def test_create_private_channel_lookup_is_scoped_to_member_guild():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = [(1, 20, 30)]
    manager = PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()
    private_channel = SimpleNamespace(
        id=40,
        name="Guild Two Private",
        set_permissions=AsyncMock(),
    )
    guild = MagicMock()
    guild.id = 2
    guild.default_role = object()
    guild.get_channel.return_value = object()
    guild.create_voice_channel = AsyncMock(return_value=private_channel)
    member = MagicMock()
    member.id = 30
    member.display_name = "Owner"
    member.guild = guild
    member.move_to = AsyncMock()

    await manager.create_private_channel(member, SimpleNamespace(category=None))

    guild.get_channel.assert_not_called()
    guild.create_voice_channel.assert_awaited_once()
    repository.save.assert_called_once_with(
        2,
        40,
        30,
        {"type": "private", "name": "Guild Two Private"},
    )
    assert manager.user_channels == {(1, 30): 20, (2, 30): 40}
    assert manager.channel_guilds == {20: 1, 40: 2}


async def test_transfer_owner_db_failure_does_not_change_cache():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = [(10, 20, 30)]
    repository.update_owner.side_effect = RuntimeError("owner update failed")
    manager = PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()

    with pytest.raises(RuntimeError, match="owner update failed"):
        await manager.transfer_channel_owner(10, 20, 31)

    assert manager.private_channels == {20: 30}
    assert manager.channel_guilds == {20: 10}
    assert manager.user_channels == {(10, 30): 20}


async def test_delete_empty_channel_runs_discord_then_db_then_cache(monkeypatch):
    from features.private_voice_chat import private_voice

    events = []
    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = [(1, 20, 30), (2, 40, 30)]
    repository.delete.side_effect = lambda channel_id: events.append("repository")
    manager = private_voice.PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()

    class RecordingCache(dict):
        def pop(self, key, default=None):
            events.append("cache")
            return super().pop(key, default)

    manager.private_channels = RecordingCache(manager.private_channels)
    manager.user_channels = RecordingCache(manager.user_channels)
    channel = SimpleNamespace(
        id=20,
        name="Private",
        members=[],
        delete=AsyncMock(side_effect=lambda **kwargs: events.append("discord")),
    )
    monkeypatch.setattr(private_voice.asyncio, "sleep", AsyncMock())

    await manager.check_and_delete_channel(channel)

    assert events == ["discord", "repository", "cache", "cache"]
    assert manager.private_channels == {40: 30}
    assert manager.channel_guilds == {40: 2}
    assert manager.user_channels == {(2, 30): 40}


async def test_delete_empty_channel_keeps_cache_when_database_delete_fails(monkeypatch):
    from features.private_voice_chat import private_voice

    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = [(10, 20, 30)]
    repository.delete.side_effect = RuntimeError("delete failed")
    manager = private_voice.PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()
    channel = SimpleNamespace(
        id=20,
        name="Private",
        members=[],
        delete=AsyncMock(),
    )
    monkeypatch.setattr(private_voice.asyncio, "sleep", AsyncMock())

    with pytest.raises(RuntimeError, match="delete failed"):
        await manager.check_and_delete_channel(channel)

    assert manager.private_channels == {20: 30}
    assert manager.user_channels == {(10, 30): 20}


async def test_delete_empty_channel_keeps_cache_when_discord_delete_fails(monkeypatch):
    from features.private_voice_chat import private_voice

    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = [(10, 20, 30)]
    manager = private_voice.PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()
    channel = SimpleNamespace(
        id=20,
        name="Private",
        members=[],
        delete=AsyncMock(side_effect=RuntimeError("discord delete failed")),
    )
    monkeypatch.setattr(private_voice.asyncio, "sleep", AsyncMock())

    with pytest.raises(RuntimeError, match="discord delete failed"):
        await manager.check_and_delete_channel(channel)

    repository.delete.assert_not_called()
    assert manager.private_channels == {20: 30}
    assert manager.user_channels == {(10, 30): 20}


async def test_cleanup_missing_channel_deletes_db_before_cache():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    events = []
    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = [(1, 20, 30), (2, 40, 30)]
    repository.delete.side_effect = lambda channel_id: events.append("repository")
    bot = MagicMock()
    bot.get_channel.side_effect = lambda channel_id: (
        None if channel_id == 20 else SimpleNamespace(id=40, members=[object()])
    )
    manager = PrivateVoiceManager(bot, repository=repository)
    await manager.initialize()

    class RecordingCache(dict):
        def pop(self, key, default=None):
            events.append("cache")
            return super().pop(key, default)

    manager.private_channels = RecordingCache(manager.private_channels)
    manager.user_channels = RecordingCache(manager.user_channels)

    await manager.cleanup_empty_channels()

    assert events == ["repository", "cache", "cache"]
    assert manager.private_channels == {40: 30}
    assert manager.channel_guilds == {40: 2}
    assert manager.user_channels == {(2, 30): 40}


async def test_cleanup_loop_never_age_deletes_existing_channel_with_members(monkeypatch):
    from features.private_voice_chat import private_voice

    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = [(10, 20, 30)]
    bot = MagicMock()
    bot.get_channel.return_value = SimpleNamespace(id=20, members=[object()])
    manager = private_voice.PrivateVoiceManager(bot, repository=repository)
    await manager.initialize()
    monkeypatch.setattr(
        private_voice.asyncio,
        "sleep",
        AsyncMock(side_effect=private_voice.asyncio.CancelledError),
    )

    with pytest.raises(private_voice.asyncio.CancelledError):
        await manager._cleanup_loop()

    assert repository.method_calls == [
        call.load_triggers(),
        call.load_private_channels(),
    ]
    assert manager.private_channels == {20: 30}
    assert manager.user_channels == {(10, 30): 20}


async def test_create_private_channel_db_failure_does_not_write_cache():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = []
    error = RuntimeError("save failed")
    repository.save.side_effect = error
    bot = MagicMock()
    manager = PrivateVoiceManager(bot, repository=repository)
    private_channel = SimpleNamespace(
        id=20,
        name="Private",
        set_permissions=AsyncMock(),
        delete=AsyncMock(),
    )
    guild = MagicMock()
    guild.default_role = object()
    guild.create_voice_channel = AsyncMock(return_value=private_channel)
    member = MagicMock()
    member.id = 30
    member.display_name = "Owner"
    member.guild = guild
    member.move_to = AsyncMock()
    trigger_channel = SimpleNamespace(category=None)

    with pytest.raises(RuntimeError, match="save failed") as raised:
        await manager.create_private_channel(member, trigger_channel)

    assert raised.value is error
    private_channel.delete.assert_awaited_once_with(
        reason="Private voice channel persistence failed"
    )
    bot.logger.error.assert_not_called()
    assert manager.private_channels == {}
    assert manager.user_channels == {}


async def test_create_private_channel_compensation_failure_logs_and_reraises_db_error():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    db_error = RuntimeError("save failed")
    repository = MagicMock()
    repository.load_triggers.return_value = {}
    repository.load_private_channels.return_value = []
    repository.save.side_effect = db_error
    bot = MagicMock()
    manager = PrivateVoiceManager(bot, repository=repository)
    private_channel = SimpleNamespace(
        id=20,
        name="Private",
        set_permissions=AsyncMock(),
        delete=AsyncMock(side_effect=RuntimeError("delete failed")),
    )
    guild = MagicMock()
    guild.default_role = object()
    guild.create_voice_channel = AsyncMock(return_value=private_channel)
    member = MagicMock()
    member.id = 30
    member.display_name = "Owner"
    member.guild = guild
    member.move_to = AsyncMock()

    with pytest.raises(RuntimeError) as raised:
        await manager.create_private_channel(member, SimpleNamespace(category=None))

    assert raised.value is db_error
    bot.logger.error.assert_called_once_with(
        "Private voice channel compensation failed after persistence error",
        exc_info=True,
    )
    assert manager.private_channels == {}
    assert manager.user_channels == {}


async def test_manager_does_not_change_trigger_cache_when_persistence_fails():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    repository = MagicMock()
    repository.load_triggers.return_value = {10: 20}
    repository.save.side_effect = RuntimeError("database unavailable")
    manager = PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()

    with pytest.raises(RuntimeError, match="database unavailable"):
        await manager.save_channel_config(10, 21, 30, {"type": "trigger"})

    assert manager.trigger_channels == {10: 20}


async def test_manager_updates_trigger_cache_after_persistence_succeeds():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    events = []
    repository = MagicMock()
    repository.load_triggers.return_value = {10: 20}
    repository.save.side_effect = lambda *args: events.append("repository")
    manager = PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()

    class RecordingCache(dict):
        def __setitem__(self, key, value):
            events.append("cache")
            return super().__setitem__(key, value)

    manager.trigger_channels = RecordingCache(manager.trigger_channels)
    await manager.save_channel_config(10, 21, 30, {"type": "trigger"})

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
    manager.save_channel_config = AsyncMock()
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
    manager.save_channel_config.assert_awaited_once_with(
        10,
        20,
        30,
        {"type": "trigger"},
    )


async def test_remove_trigger_persists_before_popping_memory_cache():
    from features.private_voice_chat.private_voice import PrivateVoiceManager

    events = []
    repository = MagicMock()
    repository.load_triggers.return_value = {10: 20}
    repository.remove_trigger.side_effect = lambda guild_id: events.append(
        ("repository", guild_id)
    )
    manager = PrivateVoiceManager(MagicMock(), repository=repository)
    await manager.initialize()

    class RecordingCache(dict):
        def pop(self, key, default=None):
            events.append(("cache", key))
            return super().pop(key, default)

    manager.trigger_channels = RecordingCache(manager.trigger_channels)
    await manager.remove_trigger_channel(10)

    assert events == [("repository", 10), ("cache", 10)]
    assert manager.trigger_channels == {}
