"""Shared parsing and display helpers for commands that target a Discord user."""

from dataclasses import dataclass

import discord


@dataclass(frozen=True, slots=True)
class UserTarget:
    """A normalized user ID and the best display name available to the bot."""

    id: int
    name: str


async def resolve_user_target(message, bot) -> UserTarget | None:
    """Resolve the first mention or first command argument to a user target."""

    if message.mentions:
        user = message.mentions[0]
        return UserTarget(id=user.id, name=str(user))

    parts = message.content.split()
    if len(parts) < 2:
        return None

    user_id = int(parts[1].strip("<@!>"))
    try:
        user = await bot.fetch_user(user_id)
    except discord.DiscordException:
        user_name = f"User ID {user_id}"
    else:
        user_name = str(user)
    return UserTarget(id=user_id, name=user_name)
