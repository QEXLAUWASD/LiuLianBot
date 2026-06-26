"""
動態更新指令 (Owner only)

從 GitHub 儲存庫拉取最新程式碼並重新載入模組。
支援公開及私人儲存庫。

Usage: >update
"""

import discord
from datetime import datetime

from core.config import get_config, reload_config
from updater.updater import perform_update, get_current_branch, get_latest_commit, restart_bot


async def update(message, bot):
    """從 GitHub 儲存庫拉取最新程式碼並更新 bot。

    此指令僅限 bot owner 使用。

    Usage: >update
    """

    # 讀取 updater 設定
    config = get_config()
    updater_cfg = config.get("updater", {})
    if not updater_cfg:
        return "❌ 更新模組尚未設定。請在 config.json 中新增 `updater` 區段。\n" \
               "```json\n\"updater\": {\n    \"github_repo\": \"owner/repo\",\n    \"branch\": \"master\"\n}\n```"

    github_repo = updater_cfg.get("github_repo", "")
    github_token = updater_cfg.get("github_token", "")  # 公開 repo 可留空
    branch = updater_cfg.get("branch", "master")
    auto_restart = updater_cfg.get("auto_restart", False)

    if not github_repo:
        return "❌ 更新設定不完整。請確認 config.json 中的 `github_repo` 已正確設定。"

    # 顯示更新前狀態
    old_branch = get_current_branch()
    old_commit = get_latest_commit()

    embed = discord.Embed(
        title="🔄 正在執行更新...",
        color=discord.Color.orange(),
        timestamp=datetime.now(),
    )
    embed.add_field(
        name="儲存庫",
        value=f"`{github_repo}`",
        inline=False,
    )
    embed.add_field(name="分支", value=f"`{branch}`", inline=True)
    embed.add_field(
        name="目前 Commit",
        value=f"`{old_commit or '???'}`",
        inline=True,
    )
    embed.set_footer(text=f"由 {message.author} 觸發")

    # 先發送進行中的 embed
    await message.channel.send(embed=embed)

    # 執行更新
    success, result_msg = perform_update(
        github_repo=github_repo,
        github_token=github_token,
        branch=branch,
        auto_restart=auto_restart,
    )

    # 更新後的 commit
    new_commit = get_latest_commit()

    # 重載 config（可能更新了設定）
    try:
        reload_config()
    except Exception:
        pass

    # 建立結果 embed
    if success:
        result_embed = discord.Embed(
            title="✅ 更新完成",
            color=discord.Color.green(),
            description=f"```\n{result_msg}\n```",
            timestamp=datetime.now(),
        )
        if new_commit and new_commit != old_commit:
            result_embed.add_field(
                name="變更摘要",
                value=f"`{old_commit or '???'}` → `{new_commit}`",
                inline=False,
            )
        result_embed.add_field(
            name="注意",
            value="模組已重新載入。部分變更可能需要重啟 bot 才能完全生效。\n"
                  "若需完全重啟，請手動重新啟動 bot 程序。",
            inline=False,
        )
    else:
        result_embed = discord.Embed(
            title="❌ 更新失敗",
            color=discord.Color.red(),
            description=f"```\n{result_msg}\n```",
            timestamp=datetime.now(),
        )

    result_embed.set_footer(text=f"由 {message.author} 觸發")
    await message.channel.send(embed=result_embed)

    # 若啟用 auto_restart 且更新成功，則重啟 bot
    if success and auto_restart:
        import asyncio
        await asyncio.sleep(1)
        await bot.close()
        restart_bot()
