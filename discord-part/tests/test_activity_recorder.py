from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from core.activity_recorder import ActivityRecorder


@pytest.mark.asyncio
async def test_activity_recorder_delegates_guild_channels_to_repository():
    repository = MagicMock()
    recorder = ActivityRecorder(
        MagicMock(),
        stats_repository=MagicMock(),
        guild_metadata_repository=MagicMock(),
        guild_channel_repository=repository,
    )
    guild = SimpleNamespace(
        id=7,
        text_channels=[
            SimpleNamespace(id=10, name="general"),
            SimpleNamespace(id=11, name="updates"),
        ],
    )

    await recorder.record_guild_channels(guild)

    repository.replace_for_guild.assert_called_once_with(
        7,
        [(10, "general"), (11, "updates")],
    )


@pytest.mark.asyncio
async def test_activity_recorder_keeps_optional_stats_failures_nonfatal():
    logger = MagicMock()
    repository = MagicMock()
    repository.record_command.side_effect = RuntimeError("temporary")
    recorder = ActivityRecorder(
        logger,
        stats_repository=repository,
        guild_metadata_repository=MagicMock(),
        guild_channel_repository=MagicMock(),
    )

    await recorder.record_command(7)

    logger.debug.assert_called_once_with(
        "Unable to record command statistic",
        exc_info=True,
    )
