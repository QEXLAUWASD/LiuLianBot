"""
Unified server logger — one-stop registration of all log-event handlers.

Usage (in main.py or bot setup)::

    from features.server_logger import register_handlers
    register_handlers(bot)

The package exposes individual handler functions so older shims in
``features.message_logger`` and ``features.user_logger`` can continue to work.
"""

from __future__ import annotations

import discord
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from discord.ext import commands

from . import base as _base
from .message_events import on_message_edit, on_message_delete, on_bulk_message_delete
from .voice_events import on_voice_state_update
from .member_events import (
    on_member_join,
    on_member_remove,
    on_member_update,
    on_member_ban,
    on_member_unban,
)
from .guild_events import on_guild_join, on_guild_remove, on_guild_update
from .channel_events import (
    on_guild_channel_create,
    on_guild_channel_delete,
    on_guild_channel_update,
)
from .role_events import (
    on_guild_role_create,
    on_guild_role_delete,
    on_guild_role_update,
)

# Re-export DB helpers so old consumers don't break
set_log_channel = _base.set_log_channel
get_log_channel = _base.get_log_channel
init_log_channel_table = _base.init_log_channel_table

# Re-export the batcher for shutdown flushing
flush_all_logs = _base._batcher.flush_all
_batcher = _base._batcher

__all__ = [
    # Registration
    "register_handlers",
    # DB helpers
    "set_log_channel",
    "get_log_channel",
    "init_log_channel_table",
    # Batcher
    "flush_all_logs",
    "_batcher",
    # Message events
    "on_message_edit",
    "on_message_delete",
    "on_bulk_message_delete",
    # Voice events
    "on_voice_state_update",
    # Member events
    "on_member_join",
    "on_member_remove",
    "on_member_update",
    "on_member_ban",
    "on_member_unban",
    # Guild events
    "on_guild_join",
    "on_guild_remove",
    "on_guild_update",
    # Channel events
    "on_guild_channel_create",
    "on_guild_channel_delete",
    "on_guild_channel_update",
    # Role events
    "on_guild_role_create",
    "on_guild_role_delete",
    "on_guild_role_update",
]


def register_handlers(bot: commands.Bot) -> None:
    """Attach all server-log event listeners to *bot*.

    Call this once during bot setup (e.g. inside ``setup_hook`` or
    after creating the bot instance).

    The function binds the following events::

        on_message_edit
        on_message_delete
        on_bulk_message_delete
        on_voice_state_update
        on_member_join
        on_member_remove
        on_member_update
        on_member_ban
        on_member_unban
        on_guild_join
        on_guild_remove
        on_guild_update
        on_guild_channel_create
        on_guild_channel_delete
        on_guild_channel_update
        on_guild_role_create
        on_guild_role_delete
        on_guild_role_update
    """

    # Wrap each handler so the event loop doesn't complain about
    # coroutines being passed directly.
    def _wrap(coro_func):
        async def wrapper(*args, **kwargs):
            await coro_func(*args, **kwargs)

        return wrapper

    bot.add_listener(_wrap(on_message_edit), "on_message_edit")
    bot.add_listener(_wrap(on_message_delete), "on_message_delete")
    bot.add_listener(_wrap(on_bulk_message_delete), "on_bulk_message_delete")
    bot.add_listener(_wrap(on_voice_state_update), "on_voice_state_update")
    bot.add_listener(_wrap(on_member_join), "on_member_join")
    bot.add_listener(_wrap(on_member_remove), "on_member_remove")
    bot.add_listener(_wrap(on_member_update), "on_member_update")
    bot.add_listener(_wrap(on_member_ban), "on_member_ban")
    bot.add_listener(_wrap(on_member_unban), "on_member_unban")
    bot.add_listener(_wrap(on_guild_join), "on_guild_join")
    bot.add_listener(_wrap(on_guild_remove), "on_guild_remove")
    bot.add_listener(_wrap(on_guild_update), "on_guild_update")
    bot.add_listener(_wrap(on_guild_channel_create), "on_guild_channel_create")
    bot.add_listener(_wrap(on_guild_channel_delete), "on_guild_channel_delete")
    bot.add_listener(_wrap(on_guild_channel_update), "on_guild_channel_update")
    bot.add_listener(_wrap(on_guild_role_create), "on_guild_role_create")
    bot.add_listener(_wrap(on_guild_role_delete), "on_guild_role_delete")
    bot.add_listener(_wrap(on_guild_role_update), "on_guild_role_update")

    _base.logger.info("Server logger handlers registered")
