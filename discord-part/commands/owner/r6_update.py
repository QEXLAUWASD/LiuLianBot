"""
R6 資料更新指令 (Owner only)

從 Ubisoft 官方網站重新爬取 Rainbow Six Siege 地圖與幹員資料，
並更新 shared/r6/ 中的 JSON 檔案。

Usage: >r6update
"""

import os
import sys
import asyncio
import importlib
import json
import tempfile
import discord
from datetime import datetime

from features.r6_roll.randommap import MAP_CACHE
from features.r6_roll.randomops import OPERATOR_CACHE
from utils.error_reporting import report_exception


# Ensure the project root is on sys.path so we can import shared/r6 modules
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


def _write_json_atomically(output_path, data):
    directory = os.path.dirname(output_path)
    fd, temp_path = tempfile.mkstemp(
        prefix=f"{os.path.basename(output_path)}-",
        suffix=".tmp",
        dir=directory,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream, indent=4, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_path, output_path)
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise


async def r6update(message, bot):
    """從 Ubisoft 官方網站更新 R6 地圖與幹員資料。

    此指令僅限 bot owner 使用。

    Usage: >r6update
    """

    # 發送處理中訊息
    status_embed = discord.Embed(
        title="🔄 正在更新 R6 資料...",
        description="正在從 Ubisoft 官方網站爬取最新地圖與幹員資料，請稍候...",
        color=discord.Color.orange(),
        timestamp=datetime.now(),
    )
    status_embed.set_footer(text=f"由 {message.author} 觸發")
    status_msg = await message.channel.send(embed=status_embed)

    results = {}

    # --- 更新地圖資料 ---
    try:
        # Dynamically import the map scraper from shared/r6
        import shared.r6.map_scraper as map_scraper
        importlib.reload(map_scraper)

        # 使用 asyncio.to_thread 避免同步 HTTP 請求阻塞 Discord 事件循環
        maps_data = await asyncio.to_thread(map_scraper.scrape_maps)
        maps_out = os.path.join(_PROJECT_ROOT, 'shared', 'r6', 'maplist.json')
        await asyncio.to_thread(_write_json_atomically, maps_out, maps_data)
        MAP_CACHE.reload()
        results['maps'] = {
            'success': True,
            'count': len(maps_data),
            'path': maps_out,
        }
    except Exception:
        results['maps'] = {
            'success': False,
            'error': report_exception(
                bot.logger,
                "r6update maps",
                "未知錯誤",
            ),
        }

    # --- 更新幹員資料 ---
    try:
        import shared.r6.operator_scraper as operator_scraper
        importlib.reload(operator_scraper)

        # 使用 asyncio.to_thread 避免同步 HTTP 請求阻塞 Discord 事件循環
        ops_data = await asyncio.to_thread(operator_scraper.scrape)
        ops_out = os.path.join(_PROJECT_ROOT, 'shared', 'r6', 'operatorlist.json')
        await asyncio.to_thread(_write_json_atomically, ops_out, ops_data)
        OPERATOR_CACHE.reload()
        total_ops = sum(len(v) for v in ops_data.values())
        results['operators'] = {
            'success': True,
            'count': total_ops,
            'path': ops_out,
        }
    except Exception:
        results['operators'] = {
            'success': False,
            'error': report_exception(
                bot.logger,
                "r6update operators",
                "未知錯誤",
            ),
        }

    # --- 建立結果 Embed ---
    maps_ok = results.get('maps', {}).get('success', False)
    ops_ok = results.get('operators', {}).get('success', False)

    if maps_ok and ops_ok:
        title = "✅ R6 資料更新完成"
        color = discord.Color.green()
        desc_lines = [
            f"🗺️ **地圖**: {results['maps']['count']} 張",
            f"👤 **幹員**: {results['operators']['count']} 名",
        ]
        description = "\n".join(desc_lines)
    elif maps_ok or ops_ok:
        title = "⚠️ R6 資料部分更新"
        color = discord.Color.yellow()
        desc_lines = []
        if maps_ok:
            desc_lines.append(f"🗺️ **地圖**: ✅ {results['maps']['count']} 張")
        else:
            desc_lines.append(f"🗺️ **地圖**: ❌ {results['maps'].get('error', '未知錯誤')}")
        if ops_ok:
            desc_lines.append(f"👤 **幹員**: ✅ {results['operators']['count']} 名")
        else:
            desc_lines.append(f"👤 **幹員**: ❌ {results['operators'].get('error', '未知錯誤')}")
        description = "\n".join(desc_lines)
    else:
        title = "❌ R6 資料更新失敗"
        color = discord.Color.red()
        desc_lines = [
            f"🗺️ **地圖**: {results['maps'].get('error', '未知錯誤')}",
            f"👤 **幹員**: {results['operators'].get('error', '未知錯誤')}",
        ]
        description = "\n".join(desc_lines)

    result_embed = discord.Embed(
        title=title,
        description=description,
        color=color,
        timestamp=datetime.now(),
    )
    result_embed.set_footer(text="R6 資料更新")

    # 嘗試編輯狀態訊息，若 session 已失效則發送新訊息
    try:
        await status_msg.edit(embed=result_embed)
    except (discord.NotFound, discord.HTTPException, AttributeError):
        await message.channel.send(embed=result_embed)
