"""
動態更新指令 (Owner only)

從 GitHub 儲存庫拉取最新程式碼並重新載入模組。
支援公開及私人儲存庫。
更新完成後提供重啟按鈕（僅 owner 可點擊）。

Usage: >update
"""

import asyncio
import discord
from datetime import datetime

from core.config import get_config, reload_config
from updater.updater import perform_update, get_current_branch, get_latest_commit, restart_bot


# ---------------------------------------------------------------------------
# 重啟確認按鈕 View（僅 owner 可操作）
# ---------------------------------------------------------------------------

class RestartConfirmView(discord.ui.View):
    """更新完成後的重啟確認按鈕。

    只有觸發指令的 owner 可以點擊按鈕。
    """

    def __init__(self, owner_id: int, *, timeout: float = 300):
        super().__init__(timeout=timeout)
        self._owner_id = owner_id
        self._used = False

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        """僅允許觸發指令的 owner 操作按鈕。"""
        if interaction.user.id != self._owner_id:
            await interaction.response.send_message(
                "❌ 只有觸發此指令的 bot owner 才能操作此按鈕。",
                ephemeral=True,
            )
            return False
        return True

    @discord.ui.button(
        label="♻️ 重啟 Bot",
        style=discord.ButtonStyle.danger,
        emoji="♻️",
    )
    async def restart_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ):
        """點擊後關閉 bot 並呼叫 start.sh restart。"""
        if self._used:
            return
        self._used = True

        # 停用所有按鈕
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True

        await interaction.response.edit_message(
            content="♻️ **正在重啟 bot...**", embed=None, view=None
        )

        # 關閉 bot 連線
        bot = interaction.client
        await bot.close()

        # 呼叫 restart_bot（會透過 start.sh restart 或降級啟動）
        restart_bot()

    @discord.ui.button(
        label="✖️ 稍後再說",
        style=discord.ButtonStyle.secondary,
        emoji="✖️",
    )
    async def cancel_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ):
        """關閉按鈕面板。"""
        if self._used:
            return
        self._used = True

        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True

        await interaction.response.edit_message(view=self)


# ---------------------------------------------------------------------------
# update 指令
# ---------------------------------------------------------------------------


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

        # ---- 重啟選擇 ----
        if auto_restart:
            # auto_restart 模式：直接重啟
            result_embed.add_field(
                name="♻️ 自動重啟",
                value="auto_restart 已啟用，bot 將自動重啟...",
                inline=False,
            )
        else:
            # 手動模式：顯示重啟按鈕（僅 owner 可操作）
            result_embed.add_field(
                name="🔘 重啟選擇",
                value="模組已重新載入。點擊下方按鈕決定是否重啟 bot：",
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

    # 取得 owner ID（從 message.author）
    owner_id = message.author.id

    # 發送結果
    if success and not auto_restart:
        # 附帶重啟確認按鈕
        view = RestartConfirmView(owner_id=owner_id)
        await message.channel.send(embed=result_embed, view=view)
    else:
        await message.channel.send(embed=result_embed)

    # 若啟用 auto_restart 且更新成功，則自動重啟
    if success and auto_restart:
        await asyncio.sleep(1)
        await bot.close()
        restart_bot()
