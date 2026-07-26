from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_eventjoin_rejects_an_event_from_another_guild(monkeypatch):
    from commands.user import events as events_module

    monkeypatch.setattr(
        events_module,
        "run_blocking",
        AsyncMock(return_value=[]),
    )
    message = SimpleNamespace(
        content=">eventjoin 42",
        guild=SimpleNamespace(id=7),
        author=SimpleNamespace(id=9),
    )

    result = await events_module.eventjoin(message, SimpleNamespace())

    assert result == "❌ 找不到此活動。"


@pytest.mark.asyncio
async def test_eventjoin_allows_only_an_event_listed_for_current_guild(monkeypatch):
    from commands.user import events as events_module

    join_event = AsyncMock(return_value="joined")

    async def run_blocking(function, *args, **kwargs):
        if function.__name__ == "list_events":
            return [{"id": 42}]
        if function.__name__ == "join_event":
            return await join_event(*args, **kwargs)
        raise AssertionError(f"unexpected blocking call: {function}")

    monkeypatch.setattr(events_module, "run_blocking", run_blocking)
    message = SimpleNamespace(
        content=">eventjoin 42",
        guild=SimpleNamespace(id=7),
        author=SimpleNamespace(id=9),
    )

    result = await events_module.eventjoin(message, SimpleNamespace())

    assert result == "✅ 已加入活動。"
    join_event.assert_awaited_once_with(42, 9)
