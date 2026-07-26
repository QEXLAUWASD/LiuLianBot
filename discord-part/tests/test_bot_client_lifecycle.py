import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from core.bot_client import MyClient
from features.private_voice_chat.private_voice import PrivateVoiceManager, get_manager


@pytest.mark.asyncio
async def test_on_message_ignores_messages_from_other_bots():
    client = SimpleNamespace(
        user=SimpleNamespace(id=1),
        command_prefix=">",
        _process_command=AsyncMock(),
    )
    message = SimpleNamespace(
        author=SimpleNamespace(id=2, bot=True),
        content=">help",
        guild=None,
    )

    await MyClient.on_message(client, message)

    client._process_command.assert_not_awaited()


@pytest.mark.asyncio
async def test_private_voice_cleanup_task_can_stop_and_restart():
    manager = PrivateVoiceManager(SimpleNamespace())
    started = asyncio.Event()

    async def cleanup_loop():
        started.set()
        await asyncio.Event().wait()

    manager._cleanup_loop = cleanup_loop
    manager.start_cleanup_task()
    first_task = manager.cleanup_task
    await started.wait()

    await manager.stop_cleanup_task()

    assert first_task.cancelled()
    assert manager.cleanup_task is None

    started.clear()
    manager.start_cleanup_task()
    second_task = manager.cleanup_task
    await started.wait()

    assert second_task is not first_task
    await manager.stop_cleanup_task()


def test_private_voice_manager_is_scoped_to_bot_instance():
    first_bot = SimpleNamespace(private_voice_manager=None)
    second_bot = SimpleNamespace(private_voice_manager=None)

    first_manager = get_manager(first_bot)
    second_manager = get_manager(second_bot)

    assert first_manager is get_manager(first_bot)
    assert first_manager is not second_manager
