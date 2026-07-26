"""Shared prefix and slash command execution pipeline."""

import inspect
from uuid import uuid4

import discord

from commands.language_manager import get_translation


async def process_command(bot, message, responder) -> None:
    """Resolve, authorize, execute, and respond to one command."""
    prefix = bot.command_prefix
    content_after_prefix = message.content[len(prefix):].strip()
    if not content_after_prefix:
        return

    command_name = content_after_prefix.split()[0]
    command_func = bot.command_handler.get_command(command_name)
    guild_id = message.guild.id if message.guild else None

    if not command_func:
        bot.logger.warning(
            "Unknown command '%s' requested by %s",
            command_name,
            message.author,
        )
        await responder(
            content=get_translation("cmd_not_found", guild_id).replace(
                "{command}", command_name
            )
        )
        return

    command_type = bot.command_handler.get_command_type(command_name)
    bot.logger.info(
        "Command '%s' (%s) requested by %s (ID: %s) in %s",
        command_name,
        command_type,
        message.author,
        message.author.id,
        message.guild.name if message.guild else "DM",
    )

    has_permission, error_message = bot.command_handler.check_permission(
        command_name, message.author, None
    )
    if not has_permission:
        bot.logger.warning(
            "Permission denied for %s to run '%s': %s",
            message.author,
            command_name,
            error_message,
        )
        await responder(
            content=get_translation("permission_denied", guild_id).replace(
                "{error}", error_message
            )
        )
        return

    bot.logger.info("Executing command '%s' for %s", command_name, message.author)
    try:
        if inspect.iscoroutinefunction(command_func):
            response = await command_func(message, bot)
        else:
            response = command_func(message, bot)

        if response is not None:
            if isinstance(response, discord.Embed):
                await responder(embed=response)
            else:
                await responder(content=response)
        bot.logger.info("Command '%s' executed successfully", command_name)
    except Exception:
        error_id = uuid4().hex[:12]
        bot.logger.error(
            "Command '%s' failed [reference=%s]",
            command_name,
            error_id,
            exc_info=True,
        )
        public_message = get_translation(
            "error_executing_command", guild_id
        ).replace("{error}", "").rstrip(" :：")
        await responder(content=f"{public_message} (Reference: {error_id})")
