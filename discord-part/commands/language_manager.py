import json
import os
from typing import Dict, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCALES_DIR = os.path.join(BASE_DIR, "locales")
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

_supported_cache: Optional[Dict[str, dict]] = None


def _load_locale_file(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def supported_locales() -> Dict[str, dict]:
    global _supported_cache
    if _supported_cache is not None:
        return _supported_cache
    locales = {}
    if not os.path.isdir(LOCALES_DIR):
        _supported_cache = locales
        return locales
    for fname in os.listdir(LOCALES_DIR):
        if fname.endswith(".json"):
            code = fname.rsplit(".", 1)[0]
            path = os.path.join(LOCALES_DIR, fname)
            locales[code] = _load_locale_file(path)
    _supported_cache = locales
    return locales


def get_guild_language(guild_id: int | None) -> str:
    """Get the preferred language code for a guild (or default)."""
    default = "en"
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                if guild_id is not None:
                    guild_langs = cfg.get("guild_languages", {})
                    if str(guild_id) in guild_langs:
                        return guild_langs[str(guild_id)]
                return cfg.get("default_language", default)
    except Exception:
        pass
    return default


def get_translation(key: str, guild_id: Optional[int] = None, default: str = "en") -> str:
    locales = supported_locales()
    lang = get_guild_language(guild_id)
    data = locales.get(lang, {})
    return data.get(key, key)


def set_guild_language(guild_id: int, lang_code: str) -> bool:
    locales = supported_locales()
    if lang_code not in locales:
        return False
    # persist to config.json under `guild_languages` map
    cfg = {}
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
    except Exception:
        cfg = {}
    if "guild_languages" not in cfg:
        cfg["guild_languages"] = {}
    cfg["guild_languages"][str(guild_id)] = lang_code
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        # invalidate cache if needed
        global _supported_cache
        _supported_cache = None
        return True
    except Exception:
        return False


def list_locale_codes() -> list:
    return list(supported_locales().keys())
