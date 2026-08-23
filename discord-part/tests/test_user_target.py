from types import SimpleNamespace
from unittest.mock import AsyncMock

import discord
import pytest

from commands.user_target import resolve_user_target


class FakeUser:
    def __init__(self, user_id: int, name: str):
        self.id = user_id
        self.name = name

    def __str__(self) -> str:
        return self.name


@pytest.mark.asyncio
async def test_resolve_user_target_prefers_first_mention():
    mentioned = FakeUser(123, "mentioned-user")
    message = SimpleNamespace(content=">addadmin 456", mentions=[mentioned])
    fetch_user = AsyncMock()

    target = await resolve_user_target(message, SimpleNamespace(fetch_user=fetch_user))

    assert target.id == 123
    assert target.name == "mentioned-user"
    fetch_user.assert_not_awaited()


@pytest.mark.asyncio
async def test_resolve_user_target_fetches_id_and_falls_back_on_discord_error():
    message = SimpleNamespace(content=">addadmin <@!456>", mentions=[])
    fetch_user = AsyncMock(side_effect=discord.DiscordException("lookup failed"))

    target = await resolve_user_target(message, SimpleNamespace(fetch_user=fetch_user))

    assert target.id == 456
    assert target.name == "User ID 456"
    fetch_user.assert_awaited_once_with(456)


@pytest.mark.asyncio
async def test_resolve_user_target_returns_none_without_argument():
    message = SimpleNamespace(content=">addadmin", mentions=[])

    assert await resolve_user_target(message, SimpleNamespace(fetch_user=AsyncMock())) is None


@pytest.mark.asyncio
async def test_resolve_user_target_rejects_invalid_id():
    message = SimpleNamespace(content=">addadmin not-a-user", mentions=[])

    with pytest.raises(ValueError):
        await resolve_user_target(message, SimpleNamespace(fetch_user=AsyncMock()))
