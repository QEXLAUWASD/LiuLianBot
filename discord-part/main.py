"""LiuLianBot Discord entry point."""

import logging

import discord

from commands.handler import CommandHandler
from core.bot_client import MyClient
from core.config import (
    ROOT_FOLDER,
    get_bot_token,
    get_command_prefix,
    get_logger,
    init_permissions,
    load_config,
)
from utils.database import ensure_database
from utils.migrations import run_migrations


def initialize_database(logger) -> None:
    ensure_database()
    run_migrations()
    logger.info("MySQL migrations completed")


def create_bot() -> tuple[MyClient, str | None, logging.Logger]:
    """Load runtime configuration and construct a bot without connecting it."""
    load_config()
    logger = get_logger(__name__)
    command_handler = CommandHandler(logger=logger)
    init_permissions(command_handler)

    intents = discord.Intents.default()
    intents.message_content = True
    intents.members = True
    intents.voice_states = True

    bot = MyClient(
        intents=intents,
        command_prefix=get_command_prefix(),
        cmd_handler=command_handler,
        logger=logger,
        root_folder=ROOT_FOLDER,
    )
    return bot, get_bot_token(), logger


def main() -> None:
    try:
        bot, token, logger = create_bot()
        if not token:
            raise ValueError("Bot token is not set in config.json")
        initialize_database(logger)
        bot.run(token)
    except ValueError as exc:
        logging.getLogger(__name__).error("Configuration Error: %s", exc)
    except Exception:
        logging.getLogger(__name__).exception("An error occurred while starting bot")


if __name__ == "__main__":
    main()
