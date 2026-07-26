from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest


@pytest.mark.asyncio
async def test_roller_rejects_direct_rolls_outside_configured_channel(monkeypatch):
    from commands.user import roller as roller_module

    message = SimpleNamespace(
        guild=SimpleNamespace(
            id=10,
            get_channel=lambda _channel_id: SimpleNamespace(mention="#roller"),
        ),
        channel=SimpleNamespace(id=99),
        content=">roller att",
    )
    monkeypatch.setattr(
        roller_module,
        "run_blocking",
        AsyncMock(return_value=123),
    )
    monkeypatch.setattr(
        roller_module,
        "get_translation",
        lambda key, _guild_id: key,
    )
    roll = Mock()
    monkeypatch.setattr(roller_module, "roll_operator_text", roll)

    result = await roller_module.roller(message, SimpleNamespace())

    assert "roller" in result
    roll.assert_not_called()


@pytest.mark.asyncio
async def test_roller_direct_roll_honors_configured_dm_mode(monkeypatch):
    from commands.user import roller as roller_module

    author = SimpleNamespace(send=AsyncMock())
    message = SimpleNamespace(
        guild=SimpleNamespace(id=10),
        channel=SimpleNamespace(id=123, send=AsyncMock()),
        author=author,
        content=">roller att",
    )
    run_blocking = AsyncMock(side_effect=[123, True])
    monkeypatch.setattr(roller_module, "run_blocking", run_blocking)
    monkeypatch.setattr(roller_module, "roll_operator_text", lambda *_: "roll")
    monkeypatch.setattr(
        roller_module,
        "get_translation",
        lambda key, _guild_id: "sent" if key == "roller_dm_sent" else key,
    )

    result = await roller_module.roller(message, SimpleNamespace())

    assert result == "sent"
    author.send.assert_awaited_once_with("roll")
    message.channel.send.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("module_name, function_name", [
    ("commands.guild_admin.set_language", "setlang"),
    ("commands.guild_admin.set_log_channel", "setlogchannel"),
])
async def test_guild_admin_commands_reject_dm(monkeypatch, module_name, function_name):
    module = __import__(module_name, fromlist=[function_name])
    monkeypatch.setattr(module, "get_translation", lambda key, _guild_id: key)
    message = SimpleNamespace(guild=None)

    result = await getattr(module, function_name)(message, SimpleNamespace())

    assert result == "no_guild"


@pytest.mark.asyncio
async def test_link_rejects_invalid_code_before_database_call(monkeypatch):
    from commands.user import link as link_module

    database_call = AsyncMock()
    monkeypatch.setattr(link_module, "run_blocking", database_call)
    message = SimpleNamespace(
        content=">link not-a-code",
        author=SimpleNamespace(id=7),
    )

    result = await link_module.link(message, SimpleNamespace())

    assert "格式無效" in result
    database_call.assert_not_awaited()
