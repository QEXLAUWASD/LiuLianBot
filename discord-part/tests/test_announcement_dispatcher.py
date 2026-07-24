from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.asyncio
async def test_dispatcher_sends_due_announcement_and_marks_it_sent():
    from features.announcements.dispatcher import AnnouncementDispatcher

    announcement = {
        "id": 10,
        "guild_id": "799987628912148501",
        "channel_id": "799987628912148504",
        "content": "Test",
    }
    repository = MagicMock()
    repository.claim_due.return_value = [announcement]
    channel = MagicMock()
    channel.send = AsyncMock()
    bot = MagicMock()
    bot.get_channel.return_value = channel

    dispatcher = AnnouncementDispatcher(bot, repository=repository, logger=MagicMock())
    await dispatcher.dispatch_due()

    channel.send.assert_awaited_once_with("Test")
    repository.mark_sent.assert_called_once_with(10)
    repository.release.assert_not_called()


@pytest.mark.asyncio
async def test_dispatcher_releases_announcement_when_channel_is_unavailable():
    from features.announcements.dispatcher import AnnouncementDispatcher

    repository = MagicMock()
    repository.claim_due.return_value = [{"id": 10, "guild_id": "1", "channel_id": "2", "content": "Test"}]
    bot = MagicMock()
    bot.get_channel.return_value = None

    dispatcher = AnnouncementDispatcher(bot, repository=repository, logger=MagicMock())
    await dispatcher.dispatch_due()

    repository.release.assert_called_once_with(10)
    repository.mark_sent.assert_not_called()
