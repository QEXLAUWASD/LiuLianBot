from commands.language_manager import get_translation, list_locale_codes
from core.config import get_config

async def getlang(message, bot):
    if message.guild is None:
        return get_translation("no_guild")
    # get current guild language
    lang_key = "default_language"
    # language_manager handles reading per-guild settings; here just show effective language code
    from commands.language_manager import supported_locales
    locales = supported_locales()
    # fetch guild setting

    config = get_config()
    guild_languages = config.get("guild_languages", {})
    current = guild_languages.get(
        str(message.guild.id),
        config.get("default_language", "en"),
    )
    codes = ", ".join(list(locales.keys()))
    return f"Current language: `{current}`\nAvailable: {codes}"
