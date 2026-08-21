"""Best-effort persistence for bot activity and guild metadata."""

from features.guild_channels.repository import GuildChannelRepository
from features.guild_metadata import GuildMetadataRepository
from features.stats.repository import StatsRepository
from utils.async_io import run_blocking


class ActivityRecorder:
    def __init__(
        self,
        logger,
        *,
        stats_repository=None,
        guild_metadata_repository=None,
        guild_channel_repository=None,
    ):
        self.logger = logger
        self.stats_repository = stats_repository or StatsRepository()
        self.guild_metadata_repository = (
            guild_metadata_repository or GuildMetadataRepository()
        )
        self.guild_channel_repository = (
            guild_channel_repository or GuildChannelRepository()
        )

    async def record_command(self, guild_id) -> None:
        try:
            await run_blocking(self.stats_repository.record_command, guild_id)
        except Exception:
            self.logger.debug("Unable to record command statistic", exc_info=True)

    async def record_voice_join(self, guild_id) -> None:
        try:
            await run_blocking(self.stats_repository.record_voice_join, guild_id)
        except Exception:
            self.logger.debug("Unable to record voice statistic", exc_info=True)

    async def record_guild_metadata(self, guild) -> None:
        try:
            await run_blocking(
                self.guild_metadata_repository.upsert,
                guild.id,
                guild.name,
                guild.owner_id,
            )
        except Exception:
            self.logger.debug("Unable to record guild metadata", exc_info=True)

    async def record_guild_channels(self, guild) -> None:
        try:
            channels = [(channel.id, channel.name) for channel in guild.text_channels]
            await run_blocking(
                self.guild_channel_repository.replace_for_guild,
                guild.id,
                channels,
            )
        except Exception:
            self.logger.debug("Unable to record guild channel metadata", exc_info=True)
