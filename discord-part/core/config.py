"""
核心設定模組 - 從 config.json 載入設定並初始化全域狀態。

將 main.py 中的設定載入邏輯抽離至此。
"""

import json
import os
import logging
from typing import Optional

import utils.logger as logger_util

# ---------------------------------------------------------------------------
# 路徑輔助
# ---------------------------------------------------------------------------

def get_root_folder() -> str:
    """取得 discord-part 資料夾的絕對路徑。"""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


ROOT_FOLDER = get_root_folder()
CONFIG_PATH = os.path.join(ROOT_FOLDER, "config.json")


# ---------------------------------------------------------------------------
# 設定載入
# ---------------------------------------------------------------------------

_config: dict = {}
_logger: Optional[logging.Logger] = None


def load_config() -> dict:
    """載入 config.json 並回傳設定字典（帶快取）。"""
    global _config
    if _config:
        return _config
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        _config = json.load(f)
    return _config


def reload_config() -> dict:
    """強制重新載入 config.json。"""
    global _config
    _config = {}
    return load_config()


def get_config() -> dict:
    """取得已載入的設定（若尚未載入則自動載入）。"""
    if not _config:
        return load_config()
    return _config


# ---------------------------------------------------------------------------
# Logger 初始化
# ---------------------------------------------------------------------------

def get_logger(name: str = __name__) -> logging.Logger:
    """取得已設定的 logger 實例。"""
    global _logger
    if _logger is not None:
        return _logger

    config = get_config()
    log_level_str = config.get("logging_level", "WARNING").upper()
    log_level = getattr(logging, log_level_str, logging.WARNING)
    _logger = logger_util.setup_logger(name, level=log_level)
    return _logger


# ---------------------------------------------------------------------------
# Bot 身份 / 權限初始化
# ---------------------------------------------------------------------------

def init_permissions(cmd_handler) -> None:
    """從 config 讀取 owner / admin / guild_admin 並註冊到 CommandHandler。

    Args:
        cmd_handler: commandHandler.CommandHandler 實例
    """
    config = get_config()

    bot_owners = config.get("bot_owner", [])
    bot_admins = config.get("bot_admin", [])
    guild_admins = config.get("guild_admins", {})

    for owner_id in bot_owners:
        cmd_handler.add_bot_owner(str(owner_id))
    for admin_id in bot_admins:
        cmd_handler.add_bot_admin(str(admin_id))

    for guild_id_str, admin_ids in guild_admins.items():
        guild_id = int(guild_id_str)
        for admin_id in admin_ids:
            cmd_handler.add_guild_admin(guild_id, str(admin_id))


def get_bot_token() -> Optional[str]:
    """從 config 中取得 bot token。"""
    return get_config().get("token")


def get_command_prefix() -> str:
    """從 config 中取得指令前綴，預設為 '>'。"""
    return get_config().get("prefix", ">")


def get_bot_owners() -> list:
    """取得 bot owner ID 列表。"""
    return get_config().get("bot_owner", [])


def get_first_owner_id() -> Optional[int]:
    """取得第一個 owner ID（用於向後相容）。"""
    owners = get_bot_owners()
    return int(owners[0]) if owners else None
