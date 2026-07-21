from command.language_manager import set_guild_language, list_locale_codes, get_translation
from discord import Embed

async def setlang(message, bot):
    # permission: guild_admin or guild_owner (checked by handler before calling)
    parts = message.content.strip().split()
    if len(parts) < 2:
        codes = ", ".join(list_locale_codes())
        return get_translation("language_invalid", message.guild.id).replace("{codes}", codes)
    lang = parts[1]
    if set_guild_language(message.guild.id, lang):
        return get_translation("language_set_success", message.guild.id).replace("{lang}", lang)
    else:
        codes = ", ".join(list_locale_codes())
        return get_translation("language_invalid", message.guild.id).replace("{codes}", codes)
