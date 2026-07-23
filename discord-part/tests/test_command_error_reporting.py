import ast
import importlib
import inspect
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, call

import pytest

from commands.guild_owner import add_guild_admin
from commands.owner import add_admin, r6_update
from commands.guild_owner import remove_guild_admin
from commands.user import r6_map_roll, r6_ops_roll
from commands.user import transfer_voice
from core import bot_client


COMMANDS_ROOT = Path(__file__).resolve().parents[1] / "commands"


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


@pytest.mark.parametrize(
    "module",
    [
        add_guild_admin,
        remove_guild_admin,
        add_admin,
        r6_update,
        transfer_voice,
    ],
)
def test_command_error_paths_do_not_format_exception_objects(module):
    tree = ast.parse(inspect.getsource(module))

    assert not any(
        isinstance(node, ast.FormattedValue)
        and isinstance(node.value, ast.Name)
        and node.value.id in {"e", "exc", "error"}
        for node in ast.walk(tree)
    )
    assert not any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "repr"
        and len(node.args) == 1
        and isinstance(node.args[0], ast.Name)
        and node.args[0].id in {"e", "exc", "error"}
        for node in ast.walk(tree)
    )


@pytest.mark.parametrize(
    "command_path",
    sorted(COMMANDS_ROOT.rglob("*.py")),
    ids=lambda path: str(path.relative_to(COMMANDS_ROOT)),
)
def test_command_public_returns_do_not_format_exception_objects(command_path):
    tree = ast.parse(command_path.read_text(encoding="utf-8"))

    for handler in (
        node for node in ast.walk(tree) if isinstance(node, ast.ExceptHandler)
    ):
        if handler.name is None:
            continue
        for returned in (
            node for node in ast.walk(handler) if isinstance(node, ast.Return)
        ):
            if returned.value is None:
                continue
            public_nodes = list(ast.walk(returned.value))
            assert not any(
                isinstance(node, ast.FormattedValue)
                and isinstance(node.value, ast.Name)
                and node.value.id == handler.name
                for node in public_nodes
            ), f"{command_path} returns an exception through an f-string"
            assert not any(
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id in {"str", "repr"}
                and len(node.args) == 1
                and isinstance(node.args[0], ast.Name)
                and node.args[0].id == handler.name
                for node in public_nodes
            ), f"{command_path} returns a stringified exception"


@pytest.mark.parametrize(
    ("command_module", "command", "operation", "base_message", "reference"),
    [
        (
            r6_map_roll,
            r6_map_roll.r6maproll,
            "r6maproll",
            "Map roll failed",
            "777777777777",
        ),
        (
            r6_ops_roll,
            r6_ops_roll.r6opsroll,
            "r6opsroll",
            "Roll failed",
            "888888888888",
        ),
    ],
)
@pytest.mark.asyncio
async def test_r6_roll_errors_redact_exception_and_use_bot_logger(
    monkeypatch,
    command_module,
    command,
    operation,
    base_message,
    reference,
):
    error_reporting = importlib.import_module("utils.error_reporting")
    secret = f"{operation}-api-secret"
    logger = Mock()
    randomizer_name = "random_map" if command_module is r6_map_roll else "random_operator"
    monkeypatch.setattr(
        command_module,
        randomizer_name,
        Mock(side_effect=RuntimeError(secret)),
    )
    monkeypatch.setattr(
        error_reporting,
        "generate_error_reference",
        lambda: reference,
    )
    message = SimpleNamespace(content=f">{operation}", guild=SimpleNamespace(id=7))
    bot = SimpleNamespace(logger=logger)

    public_message = await command(message, bot)

    assert public_message == f"{base_message} (Reference: {reference})"
    assert secret not in public_message
    logger.error.assert_called_once_with(
        "%s failed [reference=%s]",
        operation,
        reference,
        exc_info=True,
    )


@pytest.mark.asyncio
async def test_localized_command_error_redacts_exception_and_correlates_log(monkeypatch):
    error_reporting = importlib.import_module("utils.error_reporting")
    secret = "C:\\private\\config.json token=do-not-expose"
    logger = Mock()
    monkeypatch.setattr(
        add_admin,
        "get_config",
        Mock(side_effect=RuntimeError(secret)),
    )
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
    bot = SimpleNamespace(
        fetch_user=AsyncMock(return_value="target-user"),
        logger=logger,
    )

    public_message = await add_admin.addadmin(message, bot)

    assert public_message == "localized add failure (Reference: 111111111111)"
    assert secret not in public_message
    logger.error.assert_called_once_with(
        "%s failed [reference=%s]",
        "addadmin",
        "111111111111",
        exc_info=True,
    )


@pytest.mark.parametrize(
    ("command_module", "command", "content", "operation", "translation"),
    [
        (
            add_guild_admin,
            add_guild_admin.addguildadmin,
            ">addguildadmin 42",
            "addguildadmin",
            "localized guild add failure: {error}",
        ),
        (
            remove_guild_admin,
            remove_guild_admin.removeguildadmin,
            ">removeguildadmin 42",
            "removeguildadmin",
            "localized guild remove failure: {error}",
        ),
    ],
)
@pytest.mark.asyncio
async def test_guild_admin_errors_redact_exception_and_use_bot_logger(
    monkeypatch,
    command_module,
    command,
    content,
    operation,
    translation,
):
    error_reporting = importlib.import_module("utils.error_reporting")
    secret = f"{operation}-secret-token"
    logger = Mock()
    monkeypatch.setattr(
        command_module,
        "get_config",
        Mock(side_effect=RuntimeError(secret)),
    )
    monkeypatch.setattr(
        command_module,
        "get_translation",
        lambda key, guild_id: translation,
    )
    monkeypatch.setattr(
        error_reporting,
        "generate_error_reference",
        lambda: "444444444444",
    )
    author = SimpleNamespace(
        id=10,
        guild_permissions=SimpleNamespace(administrator=True),
    )
    message = SimpleNamespace(
        content=content,
        mentions=[],
        guild=SimpleNamespace(id=7),
        author=author,
    )
    bot = SimpleNamespace(
        fetch_user=AsyncMock(return_value="target-user"),
        logger=logger,
    )

    public_message = await command(message, bot)

    assert public_message == f"{translation.replace(': {error}', '')} (Reference: 444444444444)"
    assert secret not in public_message
    logger.error.assert_called_once_with(
        "%s failed [reference=%s]",
        operation,
        "444444444444",
        exc_info=True,
    )


@pytest.mark.asyncio
async def test_transfer_voice_error_redacts_exception_and_uses_bot_logger(monkeypatch):
    error_reporting = importlib.import_module("utils.error_reporting")
    secret = "voice-permission-secret"
    logger = Mock()
    author = SimpleNamespace(id=10)
    target = SimpleNamespace(id=42, display_name="target-user")
    channel = SimpleNamespace(
        members=[target],
        overwrites={},
        set_permissions=AsyncMock(side_effect=RuntimeError(secret)),
    )
    manager = SimpleNamespace(
        private_channels={123: author.id},
        get_user_channel=Mock(return_value=123),
    )
    guild = SimpleNamespace(
        id=7,
        get_member=lambda user_id: target,
        get_channel=lambda channel_id: channel,
    )
    message = SimpleNamespace(
        content=">transfervoice 42",
        mentions=[],
        guild=guild,
        author=author,
    )
    bot = SimpleNamespace(command_prefix=">", logger=logger)
    monkeypatch.setattr(transfer_voice, "get_manager", lambda client: manager)
    monkeypatch.setattr(
        transfer_voice,
        "get_translation",
        lambda key, guild_id: "localized voice failure: {error}",
    )
    monkeypatch.setattr(
        error_reporting,
        "generate_error_reference",
        lambda: "555555555555",
    )

    public_message = await transfer_voice.transfervoice(message, bot)

    assert public_message == "localized voice failure (Reference: 555555555555)"
    assert secret not in public_message
    logger.error.assert_called_once_with(
        "%s failed [reference=%s]",
        "transfervoice",
        "555555555555",
        exc_info=True,
    )


def make_transfer_voice_context(
    *,
    permission_side_effect=None,
    transfer_error=None,
    previous_overwrite=None,
    target_overwrite=None,
):
    logger = Mock()
    author = Mock(id=10)
    target = Mock(id=42, display_name="target-user")
    overwrites = {}
    if previous_overwrite is not None:
        overwrites[author] = previous_overwrite
    if target_overwrite is not None:
        overwrites[target] = target_overwrite
    channel = SimpleNamespace(
        id=123,
        name="private-channel",
        mention="<#123>",
        members=[target],
        overwrites=overwrites,
        set_permissions=AsyncMock(side_effect=permission_side_effect),
    )
    manager = SimpleNamespace(
        private_channels={channel.id: author.id},
        get_user_channel=Mock(return_value=channel.id),
        transfer_channel_owner=Mock(side_effect=transfer_error),
    )
    guild = SimpleNamespace(
        id=7,
        get_member=lambda user_id: target,
        get_channel=lambda channel_id: channel,
    )
    message = SimpleNamespace(
        content=">transfervoice 42",
        mentions=[],
        guild=guild,
        author=author,
    )
    bot = SimpleNamespace(command_prefix=">", logger=logger)
    return message, bot, manager, channel, author, target


def patch_transfer_voice_error_context(monkeypatch, manager, reference):
    error_reporting = importlib.import_module("utils.error_reporting")
    monkeypatch.setattr(transfer_voice, "get_manager", lambda client: manager)
    monkeypatch.setattr(
        transfer_voice,
        "get_translation",
        lambda key, guild_id: "localized voice failure: {error}",
    )
    monkeypatch.setattr(error_reporting, "generate_error_reference", lambda: reference)


@pytest.mark.asyncio
async def test_transfer_voice_db_failure_compensates_permissions_and_returns_reference(
    monkeypatch,
):
    secret = "owner-update-secret"
    previous_overwrite = object()
    target_overwrite = object()
    message, bot, manager, channel, author, target = make_transfer_voice_context(
        transfer_error=RuntimeError(secret),
        previous_overwrite=previous_overwrite,
        target_overwrite=target_overwrite,
    )
    patch_transfer_voice_error_context(monkeypatch, manager, "666666666666")

    public_message = await transfer_voice.transfervoice(message, bot)

    assert public_message == "localized voice failure (Reference: 666666666666)"
    assert secret not in public_message
    assert [entry.args[0] for entry in channel.set_permissions.await_args_list] == [
        author,
        target,
        author,
        target,
    ]
    assert channel.set_permissions.await_args_list[2] == call(
        author,
        overwrite=previous_overwrite,
    )
    assert channel.set_permissions.await_args_list[3] == call(
        target,
        overwrite=target_overwrite,
    )
    manager.transfer_channel_owner.assert_called_once_with(7, 123, 42)
    bot.logger.error.assert_called_once_with(
        "%s failed [reference=%s]",
        "transfervoice",
        "666666666666",
        exc_info=True,
    )


@pytest.mark.asyncio
async def test_transfer_voice_second_permission_failure_restores_previous_owner(
    monkeypatch,
):
    secret = "grant-target-secret"
    message, bot, manager, channel, author, target = make_transfer_voice_context(
        permission_side_effect=[None, RuntimeError(secret), None, None]
    )
    patch_transfer_voice_error_context(monkeypatch, manager, "777777777777")

    public_message = await transfer_voice.transfervoice(message, bot)

    assert public_message == "localized voice failure (Reference: 777777777777)"
    assert secret not in public_message
    assert [entry.args[0] for entry in channel.set_permissions.await_args_list] == [
        author,
        target,
        author,
        target,
    ]
    assert channel.set_permissions.await_args_list[2] == call(author, overwrite=None)
    assert channel.set_permissions.await_args_list[3] == call(target, overwrite=None)
    manager.transfer_channel_owner.assert_not_called()


@pytest.mark.asyncio
async def test_transfer_voice_compensation_failure_is_logged_without_public_details(
    monkeypatch,
):
    persistence_secret = "owner-update-secret"
    compensation_secret = "restore-permission-secret"
    message, bot, manager, channel, author, target = make_transfer_voice_context(
        permission_side_effect=[None, None, RuntimeError(compensation_secret), None],
        transfer_error=RuntimeError(persistence_secret),
    )
    patch_transfer_voice_error_context(monkeypatch, manager, "888888888888")

    public_message = await transfer_voice.transfervoice(message, bot)

    assert public_message == "localized voice failure (Reference: 888888888888)"
    assert persistence_secret not in public_message
    assert compensation_secret not in public_message
    assert bot.logger.error.call_args_list == [
        call(
            "Private voice permission compensation failed for previous owner",
            exc_info=True,
        ),
        call(
            "%s failed [reference=%s]",
            "transfervoice",
            "888888888888",
            exc_info=True,
        ),
    ]


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
    r6_package = importlib.import_module("shared.r6")
    monkeypatch.setitem(sys.modules, "shared.r6.map_scraper", fake_map_scraper)
    monkeypatch.setitem(
        sys.modules,
        "shared.r6.operator_scraper",
        fake_operator_scraper,
    )
    monkeypatch.setattr(r6_package, "map_scraper", fake_map_scraper, raising=False)
    monkeypatch.setattr(
        r6_package,
        "operator_scraper",
        fake_operator_scraper,
        raising=False,
    )
    monkeypatch.setattr(r6_update.importlib, "reload", lambda module: module)
    references = iter(["222222222222", "333333333333"])
    monkeypatch.setattr(
        error_reporting,
        "generate_error_reference",
        lambda: next(references),
    )
    status_message = SimpleNamespace(edit=AsyncMock())
    channel = SimpleNamespace(send=AsyncMock(return_value=status_message))
    message = SimpleNamespace(author="owner-user", channel=channel)

    await r6_update.r6update(message, SimpleNamespace(logger=logger))

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


@pytest.mark.asyncio
async def test_r6_partial_success_keeps_count_and_redacts_failed_operation(
    monkeypatch,
):
    error_reporting = importlib.import_module("utils.error_reporting")
    secret = "operator-api-secret"
    logger = Mock()

    def scrape_maps():
        return [{"name": "Bank"}, {"name": "Clubhouse"}]

    def fail_operators():
        raise RuntimeError(secret)

    fake_map_scraper = SimpleNamespace(scrape_maps=scrape_maps)
    fake_operator_scraper = SimpleNamespace(scrape=fail_operators)
    r6_package = importlib.import_module("shared.r6")
    monkeypatch.setitem(sys.modules, "shared.r6.map_scraper", fake_map_scraper)
    monkeypatch.setitem(
        sys.modules,
        "shared.r6.operator_scraper",
        fake_operator_scraper,
    )
    monkeypatch.setattr(r6_package, "map_scraper", fake_map_scraper, raising=False)
    monkeypatch.setattr(
        r6_package,
        "operator_scraper",
        fake_operator_scraper,
        raising=False,
    )
    monkeypatch.setattr(r6_update.importlib, "reload", lambda module: module)
    monkeypatch.setattr(r6_update, "_write_json_atomically", Mock())
    monkeypatch.setattr(r6_update.MAP_CACHE, "reload", Mock())
    monkeypatch.setattr(
        error_reporting,
        "generate_error_reference",
        lambda: "666666666666",
    )
    status_message = SimpleNamespace(edit=AsyncMock())
    channel = SimpleNamespace(send=AsyncMock(return_value=status_message))
    message = SimpleNamespace(author="owner-user", channel=channel)

    await r6_update.r6update(message, SimpleNamespace(logger=logger))

    result_embed = status_message.edit.await_args.kwargs["embed"]
    assert result_embed.title == "⚠️ R6 資料部分更新"
    assert "🗺️ **地圖**: ✅ 2 張" in result_embed.description
    assert "👤 **幹員**: ❌ 未知錯誤 (Reference: 666666666666)" in result_embed.description
    assert secret not in result_embed.description
    logger.error.assert_called_once_with(
        "%s failed [reference=%s]",
        "r6update operators",
        "666666666666",
        exc_info=True,
    )
