"""Background dispatcher that delivers due website announcements."""

import asyncio

from features.announcements.repository import AnnouncementRepository
from utils.async_io import run_blocking


class AnnouncementDispatcher:
    interval_seconds = 15

    def __init__(self, bot, repository=None, logger=None):
        self.bot = bot
        self.repository = repository or AnnouncementRepository()
        self.logger = logger
        self._task = None

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        try:
            await run_blocking(self.repository.recover_claims)
            while not self.bot.is_closed():
                await self.dispatch_due()
                await asyncio.sleep(self.interval_seconds)
        except asyncio.CancelledError:
            raise
        except Exception:
            if self.logger:
                self.logger.exception("Scheduled announcement dispatcher stopped")

    async def dispatch_due(self) -> None:
        announcements = await run_blocking(self.repository.claim_due)
        for announcement in announcements:
            try:
                channel = self.bot.get_channel(int(announcement["channel_id"]))
                if channel is None:
                    channel = await self.bot.fetch_channel(int(announcement["channel_id"]))
                await channel.send(announcement["content"])
                await run_blocking(self.repository.mark_sent, announcement["id"])
            except Exception:
                if self.logger:
                    self.logger.exception(
                        "Unable to send scheduled announcement %s", announcement["id"]
                    )
                await run_blocking(self.repository.release, announcement["id"])
