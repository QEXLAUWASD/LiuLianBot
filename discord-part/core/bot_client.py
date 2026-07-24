"""
Bot 客戶端模組 - 包含 MyClient (discord.py commands.Bot 子類別)。

將 main.py 中的 MyClient 類別抽離至此。
"""

from datetime import datetime
import asyncio
from typing import Optional
from uuid import uuid4

import discord
from discord import app_commands
from discord.ext import commands

from commands.language_manager import get_translation, resolve_command_description
from features.private_voice_chat.private_voice import get_manager
from features.server_logger import register_handlers
from core.slash_adapter import (
    build_slash_callback,
    build_simple_slash_callback,
    load_interaction_arg_specs,
)
from features.stats.repository import StatsRepository
from utils.async_io import run_blocking
from features.guild_metadata import GuildMetadataRepository
from features.announcements.dispatcher import AnnouncementDispatcher


class MyClient(commands.Bot):
    """Discord bot 的主要客戶端類別。"""

    def __init__(
        self,
        *,
        intents: discord.Intents,
        command_prefix: str,
        cmd_handler,
        config: dict,
        logger,
        root_folder: str,
    ):
        super().__init__(command_prefix=command_prefix, intents=intents)
        self._cmd_handler = cmd_handler
        self._config = config
        self.logger = logger
        self._root_folder = root_folder
        self.start_time: Optional[datetime] = None
        self.private_voice_manager = None
        self.stats_repository = StatsRepository()
        self.guild_metadata_repository = GuildMetadataRepository()
        self.announcement_dispatcher = AnnouncementDispatcher(self, logger=self.logger)

    # ------------------------------------------------------------------
    # Setup hook - 註冊 slash 指令與事件處理器
    # ------------------------------------------------------------------

    async def setup_hook(self):
        """於 bot 啟動前註冊所有 slash 指令與事件處理器。"""
        # 註冊 server-log 事件處理器
        register_handlers(self)

        # 載入斜線選項規格
        arg_specs = load_interaction_arg_specs(self._root_folder)

        # 為每個已載入的指令註冊 slash command
        for cmd_name, info in self._cmd_handler.list_commands_info().items():
            desc = resolve_command_description(
                cmd_name,
                guild_id=None,
                command_func=info.get("callable"),
                fallback_doc=info.get("doc"),
            )[:100]
            option_specs = arg_specs.get(cmd_name) or []

            if option_specs:
                wrapper = build_slash_callback(
                    cmd_name=cmd_name,
                    option_specs=option_specs,
                    command_prefix=self.command_prefix,
                    process_command=self._process_command,
                    logger=self.logger,
                )
            else:
                wrapper = build_simple_slash_callback(
                    cmd_name=cmd_name,
                    command_prefix=self.command_prefix,
                    process_command=self._process_command,
                )

            command = app_commands.Command(
                name=cmd_name,
                description=desc,
                callback=wrapper,
            )
            try:
                self.tree.add_command(command)
            except Exception as e:
                self.logger.error(
                    f"Failed to register slash command {cmd_name}: {e}"
                )

        # 同步 slash 指令
        await self.tree.sync()

    # ------------------------------------------------------------------
    # 生命週期事件
    # ------------------------------------------------------------------

    async def on_ready(self):
        """Bot 就緒時初始化私人語音管理員與狀態。"""
        self.start_time = datetime.now()
        self.private_voice_manager = get_manager(self)
        await self.private_voice_manager.initialize()
        self.private_voice_manager.start_cleanup_task()
        self.announcement_dispatcher.start()
        self.logger.info(f"Logged in as {self.user} (ID: {self.user.id})")
        self.logger.info("------")
        for guild in self.guilds:
            asyncio.create_task(self._record_guild_metadata(guild))
        await self.change_presence(
            activity=discord.Game(name="with discord.py")
        )

    async def close(self) -> None:
        """Flush batched logs before shutting down."""
        from features.server_logger.base import _batcher
        self.logger.info("Flushing batched logs before shutdown...")
        await self.announcement_dispatcher.stop()
        await _batcher.flush_all()
        await super().close()

    async def on_voice_state_update(self, member, before, after):
        """處理語音狀態更新 - 委派給私人語音管理員。"""
        if self.private_voice_manager is not None:
            await self.private_voice_manager.on_voice_state_update(
                member, before, after
            )
        if before.channel != after.channel and after.channel is not None:
            asyncio.create_task(self._record_voice_join(member.guild.id))

    async def on_message(self, message):
        """處理收到的訊息 - 維持舊版前綴指令相容。"""
        if message.author == self.user:
            return

        if message.content.startswith(self.command_prefix):
            if message.guild is not None:
                asyncio.create_task(self._record_command(message.guild.id))
            await self._process_command(
                message, responder=message.channel.send
            )

    async def _record_command(self, guild_id):
        try:
            await run_blocking(self.stats_repository.record_command, guild_id)
        except Exception:
            self.logger.debug("Unable to record command statistic", exc_info=True)

    async def _record_voice_join(self, guild_id):
        try:
            await run_blocking(self.stats_repository.record_voice_join, guild_id)
        except Exception:
            self.logger.debug("Unable to record voice statistic", exc_info=True)

    async def _record_guild_metadata(self, guild):
        try:
            await run_blocking(self.guild_metadata_repository.upsert, guild.id, guild.name)
        except Exception:
            self.logger.debug("Unable to record guild metadata", exc_info=True)

    # ------------------------------------------------------------------
    # 指令處理核心
    # ------------------------------------------------------------------

    async def _process_command(self, message, responder):
        """統一指令處理流程（同時服務前綴與斜線指令）。

        Args:
            message: 具有 .content, .author, .guild 屬性的訊息物件
            responder: async callable(content=..., embed=...) 用於回應
        """
        prefix = self.command_prefix

        # 忽略僅有前綴的訊息
        content_after_prefix = message.content[len(prefix):].strip()
        if not content_after_prefix:
            return

        command_name = content_after_prefix.split()[0]
        command_func = self._cmd_handler.get_command(command_name)

        if not command_func:
            self.logger.warning(
                f"Unknown command '{command_name}' requested by {message.author}"
            )
            guild_id = message.guild.id if message.guild else None
            await responder(
                content=get_translation("cmd_not_found", guild_id).replace(
                    "{command}", command_name
                )
            )
            return

        command_type = self._cmd_handler.get_command_type(command_name)
        self.logger.info(
            f"Command '{command_name}' ({command_type}) requested by "
            f"{message.author} (ID: {message.author.id}) in "
            f"{message.guild.name if message.guild else 'DM'}"
        )

        # 檢查權限
        has_permission, error_message = self._cmd_handler.check_permission(
            command_name, message.author, None
        )

        if not has_permission:
            self.logger.warning(
                f"Permission denied for {message.author} "
                f"to run '{command_name}': {error_message}"
            )
            guild_id = message.guild.id if message.guild else None
            await responder(
                content=get_translation("permission_denied", guild_id).replace(
                    "{error}", error_message
                )
            )
            return

        # 執行指令
        self.logger.info(
            f"Executing command '{command_name}' for {message.author}"
        )
        try:
            import inspect

            if inspect.iscoroutinefunction(command_func):
                response = await command_func(message, self)
            else:
                response = command_func(message, self)

            if response is not None:
                if isinstance(response, discord.Embed):
                    await responder(embed=response)
                else:
                    await responder(content=response)
            self.logger.info(
                f"Command '{command_name}' executed successfully"
            )
        except Exception:
            error_id = uuid4().hex[:12]
            self.logger.error(
                "Command '%s' failed [reference=%s]",
                command_name,
                error_id,
                exc_info=True,
            )
            guild_id = message.guild.id if message.guild else None
            message = get_translation(
                "error_executing_command", guild_id
            ).replace("{error}", "").rstrip(" :：")
            await responder(
                content=f"{message} (Reference: {error_id})"
            )
