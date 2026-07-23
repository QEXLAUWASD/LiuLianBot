import inspect
import json
import os
from typing import Callable, Dict, Optional

from core.config import get_config, update_config

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCALES_DIR = os.path.join(BASE_DIR, "locales")

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
    config = get_config()
    if guild_id is not None:
        guild_languages = config.get("guild_languages", {})
        if str(guild_id) in guild_languages:
            return guild_languages[str(guild_id)]
    return config.get("default_language", default)


def get_translation(key: str, guild_id: Optional[int] = None, default: str = "en") -> str:
    locales = supported_locales()
    lang = get_guild_language(guild_id)
    data = locales.get(lang, {})
    return data.get(key, key)


def resolve_command_description(
    command_name: str,
    guild_id: Optional[int] = None,
    command_func: Optional[Callable] = None,
    fallback_doc: Optional[str] = None,
) -> str:
    """Resolve locale first, then a one-line docstring, then a safe default."""
    key = f"cmd_desc_{command_name}"
    localized = get_translation(key, guild_id)
    if localized != key and localized.strip():
        return localized.strip()

    doc = fallback_doc
    if not doc and command_func is not None:
        try:
            doc = inspect.getdoc(command_func)
        except Exception:
            doc = None
    if doc:
        summary = doc.strip().splitlines()[0].strip()
        if summary:
            return summary

    return f"Run {command_name}"


def set_guild_language(guild_id: int, lang_code: str) -> bool:
    locales = supported_locales()
    if lang_code not in locales:
        return False
    try:
        def apply(config):
            config.setdefault("guild_languages", {})[str(guild_id)] = lang_code

        update_config(apply)
        return True
    except Exception:
        return False


def list_locale_codes() -> list:
    return list(supported_locales().keys())
