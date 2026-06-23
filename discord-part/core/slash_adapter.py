"""
Slash 指令適配器 - 將 Discord 斜線指令互動轉換為舊版訊息格式。

將 main.py 中 InteractionChannel / InteractionMessage 以及
_build_slash_callback / _build_simple_slash_callback 抽離至此。
"""

import inspect
import json
import os
from typing import Callable

import discord
from discord import app_commands


def _create_interaction_channel(interaction: discord.Interaction):
    """為 interaction 建立一個相容於舊版 Message.channel 的包裝物件。"""

    class InteractionChannel:
        def __init__(self, interaction: discord.Interaction):
            self._interaction = interaction
            self._channel = interaction.channel

        async def send(
            self,
            content: str | None = None,
            *,
            embed: discord.Embed | None = None,
            view=None,
        ):
            kwargs = {}
            if content is not None:
                kwargs["content"] = content
            if embed is not None:
                kwargs["embed"] = embed
            if view is not None:
                kwargs["view"] = view

            if not self._interaction.response.is_done():
                await self._interaction.response.send_message(**kwargs)
            else:
                await self._interaction.followup.send(**kwargs)

        def __getattr__(self, name):
            return getattr(self._channel, name)

    return InteractionChannel(interaction)


def _create_interaction_message(
    interaction: discord.Interaction,
    content: str,
    mentions: list | None = None,
    channel_mentions: list | None = None,
):
    """為 interaction 建立一個相容於舊版 discord.Message 的包裝物件。"""

    class InteractionMessage:
        def __init__(self, interaction, content, mentions, channel_mentions):
            self.content = content
            self.author = interaction.user
            self.channel = _create_interaction_channel(interaction)
            self.guild = interaction.guild
            self.interaction = interaction
            self.mentions = mentions or []
            self.channel_mentions = channel_mentions or []

    return InteractionMessage(interaction, content, mentions, channel_mentions)


async def _send_slash_response(
    interaction: discord.Interaction,
    content: str | None = None,
    embed: discord.Embed | None = None,
):
    """統一的斜線指令回應方法。"""
    if interaction.response.is_done():
        await interaction.followup.send(content=content, embed=embed)
    else:
        await interaction.response.send_message(content=content, embed=embed)


# ---------------------------------------------------------------------------
# Option type mapping
# ---------------------------------------------------------------------------

def _option_python_type(opt_type: str):
    """將選項類型字串對應到 Python 型別。"""
    t = (opt_type or "").lower()
    mapping = {
        "str": str,
        "int": int,
        "user": discord.User,
        "text_channel": discord.TextChannel,
        "voice_channel": discord.VoiceChannel,
    }
    return mapping.get(t, str)


# ---------------------------------------------------------------------------
# Slash callback builders
# ---------------------------------------------------------------------------

def build_slash_callback(
    cmd_name: str,
    option_specs: list[dict],
    command_prefix: str,
    process_command: Callable,
    logger,
) -> Callable:
    """為帶有選項的指令建立 slash command callback。

    Args:
        cmd_name: 指令名稱
        option_specs: 選項規格列表
        command_prefix: 指令前綴
        process_command: 處理指令的 async callable (message, responder) -> None
        logger: logger 實例
    """

    async def callback(interaction: discord.Interaction, **kwargs):
        parts: list[str] = []
        mentions = []
        channel_mentions = []

        for opt in option_specs:
            name = opt.get("name")
            if not isinstance(name, str):
                continue
            val = kwargs.get(name)
            if val is None:
                continue

            opt_type = (opt.get("type") or "").lower()
            if opt_type == "user":
                parts.append(f"<@{val.id}>")
                mentions.append(val)
            elif opt_type == "text_channel":
                parts.append(f"<#{val.id}>")
                channel_mentions.append(val)
            elif opt_type == "voice_channel":
                parts.append(str(val.id))
            else:
                parts.append(str(val))

        full_content = f"{command_prefix}{cmd_name}" + (
            f" {' '.join(parts)}" if parts else ""
        )

        msg = _create_interaction_message(
            interaction, full_content, mentions, channel_mentions
        )

        async def responder(
            content: str | None = None, embed: discord.Embed | None = None
        ):
            await _send_slash_response(interaction, content=content, embed=embed)

        await process_command(msg, responder=responder)

    # 建立動態簽名
    parameters = [
        inspect.Parameter(
            "interaction",
            kind=inspect.Parameter.POSITIONAL_OR_KEYWORD,
            annotation=discord.Interaction,
        )
    ]
    annotations: dict[str, object] = {"interaction": discord.Interaction}

    for opt in option_specs:
        name = opt.get("name")
        if not isinstance(name, str) or not name:
            continue
        opt_type = opt.get("type") or "str"
        py_t = _option_python_type(str(opt_type))
        required = bool(opt.get("required"))
        default = inspect._empty if required else None
        parameters.append(
            inspect.Parameter(
                name,
                kind=inspect.Parameter.KEYWORD_ONLY,
                default=default,
                annotation=py_t,
            )
        )
        annotations[name] = py_t

    callback.__signature__ = inspect.Signature(parameters)  # type: ignore[attr-defined]
    callback.__annotations__ = annotations
    return callback


def build_simple_slash_callback(
    cmd_name: str,
    command_prefix: str,
    process_command: Callable,
) -> Callable:
    """為不帶選項的指令建立 slash command callback。

    Args:
        cmd_name: 指令名稱
        command_prefix: 指令前綴
        process_command: 處理指令的 async callable (message, responder) -> None
    """

    async def wrapper(interaction: discord.Interaction):
        full_content = f"{command_prefix}{cmd_name}"
        msg = _create_interaction_message(interaction, full_content)

        async def responder(
            content: str | None = None, embed: discord.Embed | None = None
        ):
            await _send_slash_response(interaction, content=content, embed=embed)

        await process_command(msg, responder=responder)

    return wrapper


# ---------------------------------------------------------------------------
# Interaction arg specs loader
# ---------------------------------------------------------------------------

def load_interaction_arg_specs(root_folder: str) -> dict[str, list[dict]]:
    """從 tools/interaction_args.json 載入斜線選項規格。

    Returns:
        Mapping of command name -> list of option dicts.
    """
    specs_path = os.path.join(root_folder, "tools", "interaction_args.json")
    try:
        if os.path.exists(specs_path):
            with open(specs_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            mapping: dict[str, list[dict]] = {}
            for item in raw:
                cmd = item.get("command")
                opts = item.get("options") or []
                if isinstance(cmd, str) and isinstance(opts, list):
                    mapping[cmd] = opts
            return mapping
    except Exception:
        pass
    return {}
