"""
LiuLianBot - Discord Bot 入口點

此檔案僅負責初始化設定、建立客戶端並啟動 bot。
所有主要邏輯已拆分至 core/、updater/、command/ 等模組。
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
import command.commandHandler as cmd_handler_mod

# ---- 資料庫 ----
from utils.database import get_db_conn, ensure_database

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

# ---------------------------------------------------------------------------
# 資料庫連線檢查
# ---------------------------------------------------------------------------

try:
    ensure_database()
    conn = get_db_conn()
    with conn.cursor() as cursor:
        cursor.execute("SELECT DATABASE()")
        db_name = cursor.fetchone()[0]
        logger.info(f"Connected to MySQL database: {db_name}")
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        logger.info(f"Tables in database '{db_name}': {[t[0] for t in tables]}")
    conn.close()
except Exception as e:
    logger.error(f"MySQL connection failed: {e}")

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
    try:
        if TOKEN is None:
            raise ValueError("Bot token is not set in config.json")
        bot.run(TOKEN)
    except ValueError as ve:
        logger.error(f"Configuration Error: {ve}")
    except Exception as e:
        logger.error(f"An error occurred: {e}")
