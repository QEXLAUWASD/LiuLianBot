"""Extract slash-command style args for legacy message commands.

This repo's commands are message-based (they parse `message.content`).
Discord slash commands (`discord.Interaction`) need explicit option definitions.

This script scans `command/commands/**` and outputs a best-effort mapping of:
- command function name -> options (name/type/required/choices)

It is intentionally conservative:
- If a command has unclear parsing, it will emit no options.
- For known commands, it uses explicit overrides for better accuracy.

Run:
  python -m tools.extract_interaction_args

Outputs:
  - tools/interaction_args.json
  - tools/interaction_args.md
"""

from __future__ import annotations

import ast
import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, Optional


ROOT = Path(__file__).resolve().parents[1]
COMMANDS_DIR = ROOT / "command" / "commands"
OUT_JSON = Path(__file__).resolve().parent / "interaction_args.json"
OUT_MD = Path(__file__).resolve().parent / "interaction_args.md"


@dataclass(frozen=True)
class OptionSpec:
    name: str
    type: str  # discord.py-ish type label: str/int/user/text_channel/voice_channel
    required: bool
    description: str = ""
    choices: Optional[list[str]] = None


@dataclass(frozen=True)
class CommandSpec:
    command: str
    command_type: str  # user/owner/guild_admin/guild_owner
    options: list[OptionSpec]
    usage: str = ""
    source: str = "heuristic"


def _iter_command_files() -> Iterable[tuple[str, Path]]:
    if not COMMANDS_DIR.exists():
        return
    for category in sorted(p for p in COMMANDS_DIR.iterdir() if p.is_dir() and not p.name.startswith("__")):
        for py in sorted(category.glob("*.py")):
            if py.name.startswith("__"):
                continue
            yield category.name, py


def _parse_file(path: Path) -> ast.Module:
    text = path.read_text(encoding="utf-8")
    return ast.parse(text, filename=str(path))


def _get_top_level_async_functions(mod: ast.Module) -> list[ast.AsyncFunctionDef]:
    out: list[ast.AsyncFunctionDef] = []
    for node in mod.body:
        if isinstance(node, ast.AsyncFunctionDef) and not node.name.startswith("_"):
            out.append(node)
    return out


def _docstring(node: ast.AST) -> str:
    return ast.get_docstring(node) or ""


def _extract_usage(doc: str) -> str:
    # Grab the first line that looks like Usage / 用法
    for line in doc.splitlines():
        s = line.strip()
        if s.lower().startswith("usage:") or s.startswith("用法"):
            return s
    return ""


def _len_guard_min_parts(func: ast.AsyncFunctionDef) -> Optional[int]:
    """Find patterns like: if len(parts) < N: ..."""
    min_n: Optional[int] = None

    class V(ast.NodeVisitor):
        def visit_Compare(self, node: ast.Compare):
            nonlocal min_n
            try:
                # len(parts) < 2
                if (
                    isinstance(node.left, ast.Call)
                    and isinstance(node.left.func, ast.Name)
                    and node.left.func.id == "len"
                    and node.left.args
                    and isinstance(node.left.args[0], ast.Name)
                    and node.left.args[0].id in {"parts", "args"}
                    and len(node.ops) == 1
                    and isinstance(node.ops[0], ast.Lt)
                    and len(node.comparators) == 1
                    and isinstance(node.comparators[0], ast.Constant)
                    and isinstance(node.comparators[0].value, int)
                ):
                    n = int(node.comparators[0].value)
                    min_n = n if min_n is None else max(min_n, n)
            finally:
                self.generic_visit(node)

    V().visit(func)
    return min_n


# Explicit overrides per command function name.
# These are the most reliable "Interaction args" for this repo.
OVERRIDES: dict[str, list[OptionSpec]] = {
    # user
    "help": [OptionSpec(name="command", type="str", required=False, description="要查詢的指令名稱")],
    "getr6mapinfo": [OptionSpec(name="map_name", type="str", required=True, description="地圖名稱")],
    "r6opsroll": [
        OptionSpec(
            name="side",
            type="str",
            required=False,
            description="進攻/防守（可留空隨機）",
            choices=["att", "def"],
        )
    ],
    "roller": [
        OptionSpec(
            name="target",
            type="str",
            required=False,
            description="直接執行 roll (att/def/map) 或留空開啟選單",
            choices=["att", "def", "map"]
        )
    ],
    # owner
    "addadmin": [OptionSpec(name="user", type="user", required=True, description="要加入 bot admin 的使用者")],
    # guild_owner
    "addguildadmin": [OptionSpec(name="user", type="user", required=True, description="要加入伺服器管理員的使用者")],
    "removeguildadmin": [OptionSpec(name="user", type="user", required=True, description="要移除伺服器管理員的使用者")],
    # guild_admin
    "setlang": [OptionSpec(name="lang", type="str", required=True, description="語言代碼（例如 en / zh_TW）")],
    "setlogchannel": [OptionSpec(name="channel", type="text_channel", required=True, description="訊息記錄頻道")],
    "setprivatevoice": [OptionSpec(name="channel", type="voice_channel", required=False, description="設定為觸發私人語音的語音頻道；留空則顯示目前狀態")],
    "setrollerchannel": [
        OptionSpec(name="channel", type="text_channel", required=True, description="允許使用 roller 的頻道"),
        OptionSpec(name="mode", type="str", required=False, description="結果發送模式", choices=["dm", "channel"]),
    ],
    "setrollermode": [
        OptionSpec(name="mode", type="str", required=True, description="結果發送模式", choices=["dm", "channel"])
    ],
}


def _infer_options(func: ast.AsyncFunctionDef, usage: str) -> list[OptionSpec]:
    if func.name in OVERRIDES:
        return OVERRIDES[func.name]

    # Generic heuristic: if it checks for a second token, expose a single free-text arg.
    min_parts = _len_guard_min_parts(func)
    if min_parts is None:
        return []

    # parts includes the command itself as token 0
    # so min_parts >= 2 typically means at least one argument.
    if min_parts >= 2:
        return [OptionSpec(name="args", type="str", required=True, description=usage or "指令參數")]

    return []


def extract() -> list[CommandSpec]:
    specs: list[CommandSpec] = []

    for category, path in _iter_command_files():
        try:
            mod = _parse_file(path)
        except SyntaxError:
            continue

        for func in _get_top_level_async_functions(mod):
            doc = _docstring(func)
            usage = _extract_usage(doc)
            options = _infer_options(func, usage)
            source = "override" if func.name in OVERRIDES else "heuristic"
            specs.append(
                CommandSpec(
                    command=func.name,
                    command_type=category,
                    options=options,
                    usage=usage,
                    source=source,
                )
            )

    # stable output order
    specs.sort(key=lambda s: (s.command_type, s.command))
    return specs


def _write_json(specs: list[CommandSpec]) -> None:
    payload = [
        {
            **{k: v for k, v in asdict(s).items() if k not in {"options"}},
            "options": [asdict(o) for o in s.options],
        }
        for s in specs
    ]
    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _write_md(specs: list[CommandSpec]) -> None:
    lines: list[str] = []
    lines.append("# Slash Interaction Args (best-effort)\n")
    lines.append("此表是從 `command/commands/**` 靜態分析產出；`source=override` 代表有人工校正。\n")

    current = None
    for spec in specs:
        if spec.command_type != current:
            current = spec.command_type
            lines.append(f"## {current}\n")
            lines.append("| command | options | usage | source |\n")
            lines.append("|---|---|---|---|\n")

        if spec.options:
            opt_texts = []
            for o in spec.options:
                req = "required" if o.required else "optional"
                choices = f" choices={o.choices}" if o.choices else ""
                opt_texts.append(f"{o.name}:{o.type}({req}{choices})")
            opts = "<br>".join(opt_texts)
        else:
            opts = "(none)"

        usage = spec.usage.replace("|", "\\|")
        lines.append(f"| `{spec.command}` | {opts} | {usage} | {spec.source} |\n")

    OUT_MD.write_text("".join(lines), encoding="utf-8")


def main() -> None:
    specs = extract()
    _write_json(specs)
    _write_md(specs)
    print(f"Wrote: {OUT_JSON}")
    print(f"Wrote: {OUT_MD}")


if __name__ == "__main__":
    main()
