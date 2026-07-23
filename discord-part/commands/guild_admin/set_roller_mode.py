from commands.language_manager import get_translation
from features.r6_roll.roller_channel import get_roller_channel, set_roller_dm_result
from utils.async_io import run_blocking


async def setrollermode(message, bot):
    """Set roller result mode: DM or same channel."""

    if not message.guild:
        return get_translation("no_guild", None)

    parts = message.content.strip().split()
    if len(parts) < 2:
        prefix = bot.command_prefix if hasattr(bot, "command_prefix") else ">"
        return (
            get_translation("setrollermode_missing_arg", message.guild.id)
            + "\n"
            + get_translation("setrollermode_usage", message.guild.id).replace("{prefix}", prefix)
        )

    mode = parts[1].strip().lower()
    if mode in ("dm", "d", "private"):
        dm_result = True
    elif mode in ("channel", "ch", "public"):
        dm_result = False
    else:
        return get_translation("setrollermode_invalid", message.guild.id).replace("{mode}", parts[1])

    if not await run_blocking(get_roller_channel, message.guild.id):
        return get_translation("setrollermode_no_channel", message.guild.id)

    ok = await run_blocking(set_roller_dm_result, message.guild.id, dm_result)
    if not ok:
        return get_translation("setrollermode_no_channel", message.guild.id)

    return get_translation("setrollermode_success", message.guild.id).replace(
        "{mode}",
        get_translation("setrollermode_mode_dm", message.guild.id)
        if dm_result
        else get_translation("setrollermode_mode_channel", message.guild.id),
    )
