"""
Shared MySQL database utilities.

Provides:
- Automatic database creation if it doesn't exist
- Reusable connection factory
"""

import pymysql
import json
import os

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def _get_config_path() -> str:
    """Return the absolute path to config.json (one level above discord-part/)."""
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'config.json',
    )

def _load_mysql_config() -> dict:
    with open(_get_config_path(), 'r', encoding='utf-8') as f:
        config = json.load(f)
    return config.get('mysql_config', {})

# ---------------------------------------------------------------------------
# Ensure the target database exists
# ---------------------------------------------------------------------------

_db_ensured = False  # module-level flag so we only try once


def ensure_database() -> None:
    """Connect without specifying a database and CREATE DATABASE IF NOT EXISTS."""
    global _db_ensured
    if _db_ensured:
        return

    cfg = _load_mysql_config()
    db_name = cfg.get('database', 'discordbot')

    # Connect without specifying the database
    cfg_no_db = {k: v for k, v in cfg.items() if k != 'database'}
    try:
        conn = pymysql.connect(**cfg_no_db)
        with conn.cursor() as cursor:
            cursor.execute(f'CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
        conn.commit()
        conn.close()
        _db_ensured = True
        print(f"[INFO] Database '{db_name}' is ready.")
    except Exception as e:
        print(f"[ERROR] Failed to ensure database '{db_name}': {e}")
        raise


# ---------------------------------------------------------------------------
# Connection factory
# ---------------------------------------------------------------------------

def get_db_conn():
    """Return a pymysql connection to the configured database.
    
    Automatically calls ensure_database() on the first invocation.
    """
    ensure_database()
    return pymysql.connect(**_load_mysql_config())
