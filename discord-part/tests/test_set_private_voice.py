from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from commands.guild_admin.set_private_voice import resolve_voice_channel


def make_message(*, mentions=None):
    guild = MagicMock()
    return SimpleNamespace(channel_mentions=mentions or [], guild=guild)


def test_resolve_voice_channel_returns_mention_matching_raw_channel_id():
    matching_channel = SimpleNamespace(id=123)
    message = make_message(mentions=[matching_channel])

    channel = resolve_voice_channel(message, "<#123>")

    assert channel is matching_channel
    message.guild.get_channel.assert_not_called()


def test_resolve_voice_channel_ignores_unrelated_mentions():
    expected_channel = object()
    message = make_message(mentions=[SimpleNamespace(id=222)])
    message.guild.get_channel.return_value = expected_channel

    channel = resolve_voice_channel(message, "111")

    assert channel is expected_channel
    message.guild.get_channel.assert_called_once_with(111)


@pytest.mark.parametrize("raw_value", ["<#123>", "123"])
def test_resolve_voice_channel_looks_up_mention_syntax_or_numeric_id(raw_value):
    expected_channel = object()
    message = make_message()
    message.guild.get_channel.return_value = expected_channel

    channel = resolve_voice_channel(message, raw_value)

    assert channel is expected_channel
    message.guild.get_channel.assert_called_once_with(123)


def test_resolve_voice_channel_returns_none_for_invalid_input_with_later_mention():
    message = make_message(mentions=[SimpleNamespace(id=222)])

    channel = resolve_voice_channel(message, "not-a-channel-id")

    assert channel is None
    message.guild.get_channel.assert_not_called()


@pytest.mark.asyncio
async def test_set_private_voice_returns_invalid_id_for_invalid_first_argument(monkeypatch):
    from commands.guild_admin import set_private_voice

    message = make_message(mentions=[SimpleNamespace(id=222)])
    message.content = ">setprivatevoice invalid <#222>"
    message.guild.id = 10
    monkeypatch.setattr(set_private_voice, "get_translation", lambda key, guild_id: key)

    result = await set_private_voice.setprivatevoice(message, MagicMock())

    assert result == "pv_invalid_channel_id"
    message.guild.get_channel.assert_not_called()


@pytest.mark.asyncio
async def test_set_private_voice_returns_not_found_for_parseable_missing_channel(monkeypatch):
    from commands.guild_admin import set_private_voice

    message = make_message()
    message.content = ">setprivatevoice 123"
    message.guild.id = 10
    message.guild.get_channel.return_value = None
    monkeypatch.setattr(set_private_voice, "get_translation", lambda key, guild_id: key)

    result = await set_private_voice.setprivatevoice(message, MagicMock())

    assert result == "pv_channel_not_found"
    message.guild.get_channel.assert_called_once_with(123)
