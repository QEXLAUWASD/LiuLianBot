"""
Bot 客戶端模組 - 包含 MyClient (discord.py commands.Bot 子類別)。

將 main.py 中的 MyClient 類別抽離至此。
"""

from datetime import datetime
import asyncio
from typing import Optional

import discord
from discord.ext import commands

from core.activity_recorder import ActivityRecorder
from core.command_processor import process_command
from core.slash_commands import register_slash_commands
from features.announcements.dispatcher import AnnouncementDispatcher
from features.private_voice_chat.private_voice import get_manager
from features.server_logger import register_handlers


class MyClient(commands.Bot):
    """Discord bot 的主要客戶端類別。"""

    def __init__(
        self,
        *,
        intents: discord.Intents,
        command_prefix: str,
        cmd_handler,
        logger,
        root_folder: str,
    ):
        super().__init__(command_prefix=command_prefix, intents=intents)
        self.command_handler = cmd_handler
        self.logger = logger
        self._root_folder = root_folder
        self.start_time: Optional[datetime] = None
        self.private_voice_manager = None
        self.activity_recorder = ActivityRecorder(self.logger)
        self.announcement_dispatcher = AnnouncementDispatcher(self, logger=self.logger)

    # ------------------------------------------------------------------
    # Setup hook - 註冊 slash 指令與事件處理器
    # ------------------------------------------------------------------

    async def setup_hook(self):
        """於 bot 啟動前註冊所有 slash 指令與事件處理器。"""
        # 註冊 server-log 事件處理器
        register_handlers(self)
        await register_slash_commands(self)

    # ------------------------------------------------------------------
    # 生命週期事件
    # ------------------------------------------------------------------

    async def on_ready(self):
        """Bot 就緒時初始化私人語音管理員與狀態。"""
        if self.start_time is None:
            self.start_time = datetime.now()
        self.private_voice_manager = get_manager(self)
        await self.private_voice_manager.initialize()
        self.private_voice_manager.start_cleanup_task()
        self.announcement_dispatcher.start()
        self.logger.info(f"Logged in as {self.user} (ID: {self.user.id})")
        self.logger.info("------")
        for guild in self.guilds:
            asyncio.create_task(self.activity_recorder.record_guild_metadata(guild))
            asyncio.create_task(self.activity_recorder.record_guild_channels(guild))
        await self.change_presence(
            activity=discord.Game(name="with discord.py")
        )

    async def close(self) -> None:
        """Flush batched logs before shutting down."""
        from features.server_logger.base import _batcher
        self.logger.info("Flushing batched logs before shutdown...")
        await self.announcement_dispatcher.stop()
        if self.private_voice_manager is not None:
            await self.private_voice_manager.stop_cleanup_task()
        await _batcher.flush_all()
        await super().close()

    async def on_voice_state_update(self, member, before, after):
        """處理語音狀態更新 - 委派給私人語音管理員。"""
        if self.private_voice_manager is not None:
            await self.private_voice_manager.on_voice_state_update(
                member, before, after
            )
        if before.channel != after.channel and after.channel is not None:
            asyncio.create_task(
                self.activity_recorder.record_voice_join(member.guild.id)
            )

    async def on_message(self, message):
        """處理收到的訊息 - 維持舊版前綴指令相容。"""
        if message.author.bot:
            return

        if message.content.startswith(self.command_prefix):
            if message.guild is not None:
                asyncio.create_task(
                    self.activity_recorder.record_command(message.guild.id)
                )
            await self._process_command(
                message, responder=message.channel.send
            )

    async def on_guild_channel_create(self, channel):
        await self.activity_recorder.record_guild_channels(channel.guild)

    async def on_guild_channel_delete(self, channel):
        await self.activity_recorder.record_guild_channels(channel.guild)

    async def on_guild_channel_update(self, before, after):
        await self.activity_recorder.record_guild_channels(after.guild)

    # ------------------------------------------------------------------
    # 指令處理核心
    # ------------------------------------------------------------------

    async def _process_command(self, message, responder):
        await process_command(self, message, responder)
