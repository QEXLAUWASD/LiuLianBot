from command.language_manager import get_translation, list_locale_codes

async def getlang(message, bot):
    if message.guild is None:
        return get_translation("no_guild")
    # get current guild language
    lang_key = "default_language"
    # language_manager handles reading per-guild settings; here just show effective language code
    from command.language_manager import supported_locales
    locales = supported_locales()
    # fetch guild setting
    import json, os
    cfg_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")
    current = None
    try:
        if os.path.exists(cfg_path):
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                guild_langs = cfg.get("guild_languages", {})
                current = guild_langs.get(str(message.guild.id), cfg.get("default_language", "en"))
    except Exception:
        current = "en"
    codes = ", ".join(list(locales.keys()))
    return f"Current language: `{current}`\nAvailable: {codes}"
