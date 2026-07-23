"""
LiuLianBot - Discord Bot 入口點

此檔案僅負責初始化設定、建立客戶端並啟動 bot。
所有主要邏輯已拆分至 core/、updater/、commands/ 等模組。
"""

import discord

# ---- 核心模組 ----
from core.config import (
    load_config,
    get_config,
    get_logger,
    init_permissions,
    get_bot_token,
    get_command_prefix,
    get_first_owner_id,
    ROOT_FOLDER,
)
from core.bot_client import MyClient

# ---- 指令處理 ----
import commands.handler as cmd_handler_mod

# ---- 資料庫 ----
from utils.database import ensure_database
from utils.migrations import run_migrations

# ---------------------------------------------------------------------------
# 初始化
# ---------------------------------------------------------------------------

# 載入設定
config = load_config()

# 初始化 logger
logger = get_logger(__name__)

# 初始化指令處理器並設定權限
cmd_handler = cmd_handler_mod.handler
init_permissions(cmd_handler)

# 提取常用設定
TOKEN = get_bot_token()
COMMAND_PREFIX = get_command_prefix()
BOT_OWNER_ID = get_first_owner_id()


def initialize_database(logger) -> None:
    ensure_database()
    run_migrations()
    logger.info("MySQL migrations completed")


# ---------------------------------------------------------------------------
# Discord Intents
# ---------------------------------------------------------------------------

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.voice_states = True

# ---------------------------------------------------------------------------
# Bot 客戶端
# ---------------------------------------------------------------------------

bot = MyClient(
    intents=intents,
    command_prefix=COMMAND_PREFIX,
    cmd_handler=cmd_handler,
    config=config,
    logger=logger,
    root_folder=ROOT_FOLDER,
)

# ---------------------------------------------------------------------------
# 啟動
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    initialize_database(logger)
    try:
        if TOKEN is None:
            raise ValueError("Bot token is not set in config.json")
        bot.run(TOKEN)
    except ValueError as ve:
        logger.error(f"Configuration Error: {ve}")
    except Exception as e:
        logger.error(f"An error occurred: {e}")
