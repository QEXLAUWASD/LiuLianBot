from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from commands.guild_admin.set_private_voice import resolve_voice_channel


def make_message(*, mentions=None):
    guild = MagicMock()
    return SimpleNamespace(channel_mentions=mentions or [], guild=guild)


def test_resolve_voice_channel_prefers_first_mention_over_raw_value():
    first_channel = object()
    message = make_message(mentions=[first_channel, object()])

    channel = resolve_voice_channel(message, "not-a-channel-id")

    assert channel is first_channel
    message.guild.get_channel.assert_not_called()


@pytest.mark.parametrize("raw_value", ["<#123>", "123"])
def test_resolve_voice_channel_looks_up_mention_syntax_or_numeric_id(raw_value):
    expected_channel = object()
    message = make_message()
    message.guild.get_channel.return_value = expected_channel

    channel = resolve_voice_channel(message, raw_value)

    assert channel is expected_channel
    message.guild.get_channel.assert_called_once_with(123)


def test_resolve_voice_channel_returns_none_for_invalid_input():
    message = make_message()

    channel = resolve_voice_channel(message, "not-a-channel-id")

    assert channel is None
    message.guild.get_channel.assert_not_called()
