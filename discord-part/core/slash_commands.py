"""Slash command registration for the Discord client."""

from discord import app_commands

from commands.language_manager import resolve_command_description
from core.slash_adapter import (
    build_simple_slash_callback,
    build_slash_callback,
    load_interaction_arg_specs,
)


async def register_slash_commands(bot) -> None:
    arg_specs = load_interaction_arg_specs(bot._root_folder)

    for command_name, info in bot.command_handler.list_commands_info().items():
        description = resolve_command_description(
            command_name,
            guild_id=None,
            command_func=info.get("callable"),
            fallback_doc=info.get("doc"),
        )[:100]
        option_specs = arg_specs.get(command_name) or []

        if option_specs:
            callback = build_slash_callback(
                cmd_name=command_name,
                option_specs=option_specs,
                command_prefix=bot.command_prefix,
                process_command=bot._process_command,
                logger=bot.logger,
            )
        else:
            callback = build_simple_slash_callback(
                cmd_name=command_name,
                command_prefix=bot.command_prefix,
                process_command=bot._process_command,
            )

        command = app_commands.Command(
            name=command_name,
            description=description,
            callback=callback,
        )
        try:
            bot.tree.add_command(command)
        except Exception:
            bot.logger.exception("Failed to register slash command %s", command_name)

    await bot.tree.sync()
