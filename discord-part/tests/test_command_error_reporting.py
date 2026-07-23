import ast
import importlib
import inspect
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from commands.guild_owner import add_guild_admin
from commands.owner import add_admin, r6_update
from commands.guild_owner import remove_guild_admin
from commands.user import transfer_voice
from core import bot_client


def test_error_reporter_logs_reference_and_formats_safe_public_message():
    error_reporting = importlib.import_module("utils.error_reporting")
    logger = Mock()

    public_message = error_reporting.report_exception(
        logger,
        "saving guild administrator",
        "localized failure: {error}",
        reference_generator=lambda: "a1b2c3d4e5f6",
    )

    assert public_message == "localized failure (Reference: a1b2c3d4e5f6)"
    logger.error.assert_called_once_with(
        "%s failed [reference=%s]",
        "saving guild administrator",
        "a1b2c3d4e5f6",
        exc_info=True,
    )


def test_error_reporter_appends_reference_when_message_has_no_placeholder():
    error_reporting = importlib.import_module("utils.error_reporting")

    public_message = error_reporting.format_public_error(
        "localized failure",
        "123456789abc",
    )

    assert public_message == "localized failure (Reference: 123456789abc)"


def test_error_references_are_twelve_hex_characters():
    error_reporting = importlib.import_module("utils.error_reporting")

    reference = error_reporting.generate_error_reference()

    assert len(reference) == 12
    assert all(character in "0123456789abcdef" for character in reference)


@pytest.mark.parametrize(
    "module",
    [
        add_guild_admin,
        remove_guild_admin,
        add_admin,
        r6_update,
        transfer_voice,
        bot_client,
    ],
)
def test_command_public_error_paths_do_not_stringify_exceptions(module):
    tree = ast.parse(inspect.getsource(module))

    assert not any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "str"
        and len(node.args) == 1
        and isinstance(node.args[0], ast.Name)
        and node.args[0].id in {"e", "exc", "error"}
        for node in ast.walk(tree)
    )


@pytest.mark.asyncio
async def test_localized_command_error_redacts_exception_and_correlates_log(monkeypatch):
    error_reporting = importlib.import_module("utils.error_reporting")
    secret = "C:\\private\\config.json token=do-not-expose"
    logger = Mock()
    config_path = Mock()
    config_path.exists.side_effect = RuntimeError(secret)
    monkeypatch.setattr(add_admin, "Path", lambda value: config_path)
    monkeypatch.setattr(add_admin, "logger", logger, raising=False)
    monkeypatch.setattr(
        add_admin,
        "get_translation",
        lambda key, guild_id: "localized add failure: {error}",
    )
    monkeypatch.setattr(
        error_reporting,
        "generate_error_reference",
        lambda: "111111111111",
    )
    message = SimpleNamespace(
        content=">addadmin 42",
        mentions=[],
        guild=SimpleNamespace(id=7),
    )
    bot = SimpleNamespace(fetch_user=AsyncMock(return_value="target-user"))

    public_message = await add_admin.addadmin(message, bot)

    assert public_message == "localized add failure (Reference: 111111111111)"
    assert secret not in public_message
    logger.error.assert_called_once_with(
        "%s failed [reference=%s]",
        "addadmin",
        "111111111111",
        exc_info=True,
    )


@pytest.mark.asyncio
async def test_r6_failures_use_separate_references_without_exposing_exceptions(
    monkeypatch,
):
    error_reporting = importlib.import_module("utils.error_reporting")
    map_secret = "map-token=do-not-expose"
    operator_secret = "C:\\private\\operators.json"
    logger = Mock()

    def fail_maps():
        raise RuntimeError(map_secret)

    def fail_operators():
        raise RuntimeError(operator_secret)

    fake_map_scraper = SimpleNamespace(scrape_maps=fail_maps)
    fake_operator_scraper = SimpleNamespace(scrape=fail_operators)
    monkeypatch.setitem(sys.modules, "shared.r6.map_scraper", fake_map_scraper)
    monkeypatch.setitem(
        sys.modules,
        "shared.r6.operator_scraper",
        fake_operator_scraper,
    )
    monkeypatch.setattr(r6_update.importlib, "reload", lambda module: module)
    monkeypatch.setattr(r6_update, "logger", logger, raising=False)
    references = iter(["222222222222", "333333333333"])
    monkeypatch.setattr(
        error_reporting,
        "generate_error_reference",
        lambda: next(references),
    )
    status_message = SimpleNamespace(edit=AsyncMock())
    channel = SimpleNamespace(send=AsyncMock(return_value=status_message))
    message = SimpleNamespace(author="owner-user", channel=channel)

    await r6_update.r6update(message, SimpleNamespace())

    result_embed = status_message.edit.await_args.kwargs["embed"]
    assert "Reference: 222222222222" in result_embed.description
    assert "Reference: 333333333333" in result_embed.description
    assert map_secret not in result_embed.description
    assert operator_secret not in result_embed.description
    assert logger.error.call_args_list == [
        (
            ("%s failed [reference=%s]", "r6update maps", "222222222222"),
            {"exc_info": True},
        ),
        (
            (
                "%s failed [reference=%s]",
                "r6update operators",
                "333333333333",
            ),
            {"exc_info": True},
        ),
    ]
