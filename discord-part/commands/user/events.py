import discord

from features.events.repository import EventRepository, build_balanced_teams
from utils.async_io import run_blocking


def _event_id(message):
    parts = message.content.split()
    if len(parts) != 2 or not parts[1].isdigit():
        return None
    return int(parts[1])


async def events(message, bot):
    """列出此 Discord 伺服器的近期活動。用法：>events"""
    if message.guild is None:
        return "❌ 此指令只能在伺服器中使用。"
    rows = await run_blocking(EventRepository().list_events, message.guild.id)
    if not rows:
        return "目前沒有即將開始的活動。"
    embed = discord.Embed(title="R6 活動", color=discord.Color.blue())
    for row in rows:
        start = row["start_at"].strftime("%Y-%m-%d %H:%M") if hasattr(row["start_at"], "strftime") else str(row["start_at"])
        embed.add_field(
            name=f"#{row['id']} {row['title']}",
            value=f"{row['mode']} | {start}\n報名：{row['participant_count']}/{row['max_players']}\n`>eventjoin {row['id']}`",
            inline=False,
        )
    return embed


async def eventjoin(message, bot):
    """報名活動。用法：>eventjoin <event_id>"""
    event_id = _event_id(message)
    if event_id is None:
        return "❌ 用法：`>eventjoin <event_id>`"
    result = await run_blocking(EventRepository().join_event, event_id, message.author.id)
    return {
        "joined": "✅ 已加入活動。" if result == "joined" else "✅ 你已經報名此活動。",
        "not_linked": "❌ 請先在網站 Account 頁面產生代碼，再使用 `>link <code>`。",
        "not_found": "❌ 找不到此活動。",
        "closed": "❌ 此活動已關閉報名。",
        "full": "❌ 此活動名額已滿。",
    }.get(result, "❌ 無法加入活動。")


async def eventleave(message, bot):
    """退出活動。用法：>eventleave <event_id>"""
    event_id = _event_id(message)
    if event_id is None:
        return "❌ 用法：`>eventleave <event_id>`"
    result = await run_blocking(EventRepository().leave_event, event_id, message.author.id)
    return {
        "left": "✅ 已退出活動。",
        "not_joined": "你沒有報名此活動。",
        "not_linked": "❌ 你的 Discord 帳戶尚未連結網站。",
    }.get(result, "❌ 無法退出活動。")


async def eventteams(message, bot):
    """顯示活動的平衡分隊。用法：>eventteams <event_id>"""
    event_id = _event_id(message)
    if event_id is None:
        return "❌ 用法：`>eventteams <event_id>`"
    players = await run_blocking(EventRepository().participants, event_id)
    if not players:
        return "此活動目前沒有報名者。"
    alpha, bravo = build_balanced_teams(players)
    embed = discord.Embed(title=f"活動 #{event_id} 分隊", color=discord.Color.green())
    embed.add_field(name="A 隊", value="\n".join(alpha) or "-", inline=True)
    embed.add_field(name="B 隊", value="\n".join(bravo) or "-", inline=True)
    return embed
