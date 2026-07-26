import discord

from commands.language_manager import get_translation
from commands.roller_service import roll_map_text, roll_operator_text, send_roller_prompt
from features.r6_roll.roller_channel import get_roller_channel, get_roller_dm_result
from utils.async_io import run_blocking


async def roller(message, bot) -> str | None:
    """Send buttons to choose what to roll (operator or map) in-channel."""
    guild_id = message.guild.id if message.guild else None
    roller_channel_id = None
    dm_result = False

    if message.guild:
        roller_channel_id = await run_blocking(get_roller_channel, guild_id)
        if roller_channel_id:
            if getattr(message.channel, "id", None) != roller_channel_id:
                channel = message.guild.get_channel(roller_channel_id)
                channel_mention = (
                    channel.mention if channel else f"#{roller_channel_id}"
                )
                return get_translation("roller_wrong_channel", guild_id).replace(
                    "{channel}", channel_mention
                )
            dm_result = await run_blocking(get_roller_dm_result, guild_id)

    parts = message.content.strip().split()
    if len(parts) > 1:
        target = parts[1].lower()
        output = None
        if target in ("att", "atk", "attacker", "attack"):
            output = roll_operator_text(guild_id, "Att")
        elif target in ("def", "defender", "defense"):
            output = roll_operator_text(guild_id, "Def")
        elif target == "map":
            output = roll_map_text(guild_id)

        if output:
            if dm_result:
                try:
                    await message.author.send(output)
                    return get_translation("roller_dm_sent", guild_id)
                except discord.Forbidden:
                    return get_translation("roller_dm_failed", guild_id)
            await message.channel.send(output)
            return None

    if roller_channel_id:
        await send_roller_prompt(message.channel, guild_id, dm_result=dm_result)
        return None

    await send_roller_prompt(message.channel, guild_id, dm_result=False)
    return None
