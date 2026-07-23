import asyncio
import ast
import inspect
import json
import threading
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from commands.owner import update as update_module
from commands import language_manager
from commands.user import help as help_module
from core import bot_client
from updater import updater


def test_update_coordinator_shields_only_git_work_in_thread():
    tree = ast.parse(inspect.getsource(update_module._run_update))
    to_thread_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "asyncio"
        and node.func.attr == "to_thread"
    ]

    assert len(to_thread_calls) == 1
    call = to_thread_calls[0]
    assert isinstance(call.args[0], ast.Name)
    assert call.args[0].id == "_perform_git_update_unlocked"
    assert {keyword.arg for keyword in call.keywords} == {
        "github_repo",
        "github_token",
        "branch",
    }
    assert not any(
        isinstance(node, ast.Name) and node.id == "reload_modules"
        for node in ast.walk(tree)
    )
    assert any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "asyncio"
        and node.func.attr == "shield"
        for node in ast.walk(tree)
    )


def test_updater_source_has_no_hot_reload_path():
    updater_source = inspect.getsource(updater)
    command_source = inspect.getsource(update_module)

    assert "importlib.reload" not in updater_source
    assert "def reload_modules" not in updater_source
    assert "reload_modules" not in command_source


def test_update_help_locales_require_restart_to_apply(monkeypatch):
    locales_dir = Path(__file__).resolve().parents[1] / "locales"
    locales = {
        code: json.loads((locales_dir / f"{code}.json").read_text(encoding="utf-8"))
        for code in ("zh_TW", "en")
    }
    monkeypatch.setattr(language_manager, "supported_locales", lambda: locales)

    monkeypatch.setattr(language_manager, "get_guild_language", lambda guild_id: "zh_TW")
    zh_description = language_manager.get_translation("cmd_desc_update", guild_id=1)
    assert "更新檔案" in zh_description
    assert "重啟" in zh_description
    assert "套用" in zh_description
    assert "重新載入" not in zh_description

    monkeypatch.setattr(language_manager, "get_guild_language", lambda guild_id: "en")
    en_description = language_manager.get_translation("cmd_desc_update", guild_id=1)
    assert "update files" in en_description
    assert "restart" in en_description
    assert "apply" in en_description
    assert "reload" not in en_description


@pytest.mark.parametrize("locale_code", ["zh_TW", "en"])
@pytest.mark.asyncio
async def test_help_update_detail_and_list_use_localized_description(
    monkeypatch,
    locale_code,
):
    locales_dir = Path(__file__).resolve().parents[1] / "locales"
    locales = {
        code: json.loads((locales_dir / f"{code}.json").read_text(encoding="utf-8"))
        for code in ("zh_TW", "en")
    }
    expected = locales[locale_code]["cmd_desc_update"]
    monkeypatch.setattr(language_manager, "supported_locales", lambda: locales)
    monkeypatch.setattr(
        language_manager,
        "get_guild_language",
        lambda guild_id: locale_code,
    )

    async def stale_update_doc(message, bot):
        """Legacy updater doc that claims hot reload."""

    handler = SimpleNamespace(
        get_command=lambda name: stale_update_doc if name == "update" else None,
        list_commands=lambda: ["update"],
        command_types={"update": "owner"},
    )
    monkeypatch.setattr(help_module.commands.handler, "handler", handler)

    detail_channel = SimpleNamespace(send=AsyncMock())
    detail_message = SimpleNamespace(
        content=">help update",
        guild=SimpleNamespace(id=1),
        channel=detail_channel,
    )
    await help_module.help(detail_message, SimpleNamespace())
    assert detail_channel.send.await_args.kwargs["embed"].description == expected

    list_channel = SimpleNamespace(send=AsyncMock())
    list_message = SimpleNamespace(
        content=">help",
        guild=SimpleNamespace(id=1),
        channel=list_channel,
    )
    await help_module.help(list_message, SimpleNamespace())
    owner_field = next(
        field
        for field in list_channel.send.await_args.kwargs["embed"].fields
        if expected in field.value
    )
    assert "`update`" in owner_field.value
    assert "Legacy updater doc" not in owner_field.value


def test_description_resolver_falls_back_to_docstring_when_locale_is_missing(monkeypatch):
    assert hasattr(language_manager, "resolve_command_description")

    async def undocumented_locale_command(message, bot):
        """Fallback summary.

        Additional details should not appear in short descriptions.
        """

    monkeypatch.setattr(language_manager, "supported_locales", lambda: {"en": {}})
    monkeypatch.setattr(language_manager, "get_guild_language", lambda guild_id: "en")

    assert language_manager.resolve_command_description(
        "missing_locale",
        guild_id=None,
        command_func=undocumented_locale_command,
    ) == "Fallback summary."


@pytest.mark.asyncio
async def test_setup_hook_uses_default_locale_for_update_slash_description(monkeypatch):
    locales_dir = Path(__file__).resolve().parents[1] / "locales"
    en_locale = json.loads((locales_dir / "en.json").read_text(encoding="utf-8"))
    expected = en_locale["cmd_desc_update"]
    monkeypatch.setattr(language_manager, "supported_locales", lambda: {"en": en_locale})
    monkeypatch.setattr(language_manager, "get_guild_language", lambda guild_id: "en")

    async def stale_update_doc(message, bot):
        """Legacy slash updater doc that claims hot reload."""

    command_handler = SimpleNamespace(
        list_commands_info=lambda: {
            "update": {
                "doc": inspect.getdoc(stale_update_doc),
                "callable": stale_update_doc,
            },
            "fallback": {
                "doc": "Handler fallback summary.\nAdditional details.",
                "callable": None,
            },
        }
    )
    registered = []
    tree = SimpleNamespace(
        add_command=lambda command: registered.append(command),
        sync=AsyncMock(),
    )
    client = SimpleNamespace(
        _cmd_handler=command_handler,
        _root_folder="unused",
        command_prefix=">",
        _process_command=AsyncMock(),
        logger=Mock(),
        tree=tree,
    )

    async def slash_callback(interaction):
        return None

    monkeypatch.setattr(bot_client, "register_handlers", lambda client: None)
    monkeypatch.setattr(bot_client, "load_interaction_arg_specs", lambda root: {})
    monkeypatch.setattr(
        bot_client,
        "build_simple_slash_callback",
        lambda **kwargs: slash_callback,
    )
    monkeypatch.setattr(
        bot_client.app_commands,
        "Command",
        lambda **kwargs: SimpleNamespace(**kwargs),
    )

    await bot_client.MyClient.setup_hook(client)

    assert len(registered) == 2
    update_command = next(command for command in registered if command.name == "update")
    fallback_command = next(command for command in registered if command.name == "fallback")
    assert update_command.description == expected
    assert "restart" in update_command.description
    assert "Legacy slash updater doc" not in update_command.description
    assert fallback_command.description == "Handler fallback summary."
    tree.sync.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_passes_configuration_to_coordinator_and_uses_result(monkeypatch):
    updater_config = {
        "github_repo": "owner/private-repo",
        "github_token": "token-value",
        "branch": "release",
        "auto_restart": False,
    }
    monkeypatch.setattr(update_module, "get_config", lambda: {"updater": updater_config})
    monkeypatch.setattr(update_module, "get_current_branch", lambda: "release")
    monkeypatch.setattr(update_module, "get_latest_commit", lambda: "abc1234")
    monkeypatch.setattr(update_module, "reload_config", Mock())
    coordinator = AsyncMock(return_value=(False, "update failed safely"))
    monkeypatch.setattr(update_module, "_run_update", coordinator)
    channel = SimpleNamespace(send=AsyncMock())
    message = SimpleNamespace(author=SimpleNamespace(id=42), channel=channel)

    await update_module.update(message, SimpleNamespace())

    coordinator.assert_awaited_once_with(
        github_repo="owner/private-repo",
        github_token="token-value",
        branch="release",
        auto_restart=False,
    )
    result_embed = channel.send.await_args_list[1].kwargs["embed"]
    assert result_embed.title == "❌ 更新失敗"
    assert result_embed.description == "```\nupdate failed safely\n```"


@pytest.mark.asyncio
async def test_git_update_preserves_live_handler_and_requires_restart(monkeypatch):
    event_loop_thread = threading.get_ident()
    git_threads = []

    live_handler = SimpleNamespace(commands={"update": update_module.update})
    original_handler = live_handler
    original_command = live_handler.commands["update"]

    def fake_git_update(**kwargs):
        git_threads.append(threading.get_ident())
        return True, "updated"

    monkeypatch.setattr(update_module, "_perform_git_update_unlocked", fake_git_update)

    success, message = await update_module._run_update(
        github_repo="owner/repo",
        github_token="",
        branch="main",
        auto_restart=False,
    )

    assert success is True
    assert git_threads and git_threads[0] != event_loop_thread
    assert live_handler is original_handler
    assert live_handler.commands["update"] is original_command
    assert "重啟" in message
    assert "套用變更" in message
    assert "重新載入" not in message
    assert "個模組" not in message


@pytest.mark.asyncio
async def test_failed_git_does_not_add_restart_success_message(monkeypatch):
    monkeypatch.setattr(
        update_module,
        "_perform_git_update_unlocked",
        lambda **kwargs: (False, "update failed safely"),
    )

    result = await update_module._run_update(
        github_repo="owner/repo",
        github_token="",
        branch="main",
        auto_restart=False,
    )

    assert result == (False, "update failed safely")
    assert "重啟" not in result[1]
    assert "套用變更" not in result[1]


@pytest.mark.asyncio
async def test_auto_restart_success_message_is_preserved(monkeypatch):
    monkeypatch.setattr(
        update_module,
        "_perform_git_update_unlocked",
        lambda **kwargs: (True, "updated"),
    )

    success, message = await update_module._run_update(
        github_repo="owner/repo",
        github_token="",
        branch="main",
        auto_restart=True,
    )

    assert success is True
    assert "auto_restart 已啟用" in message
    assert "重啟" in message
    assert "套用變更" in message
    assert "重新載入" not in message


@pytest.mark.asyncio
async def test_update_success_keeps_restart_view_without_hot_reload_claim(monkeypatch):
    monkeypatch.setattr(
        update_module,
        "get_config",
        lambda: {
            "updater": {
                "github_repo": "owner/repo",
                "branch": "main",
                "auto_restart": False,
            }
        },
    )
    monkeypatch.setattr(update_module, "get_current_branch", lambda: "main")
    monkeypatch.setattr(update_module, "get_latest_commit", lambda: "abc1234")
    monkeypatch.setattr(update_module, "reload_config", Mock())
    monkeypatch.setattr(
        update_module,
        "_run_update",
        AsyncMock(return_value=(True, "updated\n\n請重啟 bot 以套用變更")),
    )
    channel = SimpleNamespace(send=AsyncMock())
    message = SimpleNamespace(author=SimpleNamespace(id=42), channel=channel)

    await update_module.update(message, SimpleNamespace())

    result_call = channel.send.await_args_list[1]
    result_embed = result_call.kwargs["embed"]
    assert result_embed.title == "✅ 更新完成"
    assert isinstance(result_call.kwargs["view"], update_module.RestartConfirmView)
    restart_field = next(field for field in result_embed.fields if field.name == "🔘 重啟選擇")
    assert "檔案已更新" in restart_field.value
    assert "模組已重新載入" not in restart_field.value


@pytest.mark.asyncio
async def test_command_error_uses_reference_without_exposing_exception(monkeypatch):
    secret = "github-token-should-not-be-public"

    async def failing_command(message, client):
        raise RuntimeError(secret)

    command_handler = SimpleNamespace(
        get_command=lambda name: failing_command,
        get_command_type=lambda name: "owner",
        check_permission=lambda name, author, context: (True, None),
    )
    logger = Mock()
    client = SimpleNamespace(command_prefix=">", _cmd_handler=command_handler, logger=logger)
    message = SimpleNamespace(
        content=">update",
        author=SimpleNamespace(id=42),
        guild=SimpleNamespace(id=7, name="Test Guild"),
    )
    responder = AsyncMock()
    monkeypatch.setattr(
        bot_client,
        "get_translation",
        lambda key, guild_id: "localized error: {error}",
    )
    monkeypatch.setattr(
        bot_client,
        "uuid4",
        lambda: SimpleNamespace(hex="a1b2c3d4e5f678901234567890abcdef"),
    )

    await bot_client.MyClient._process_command(client, message, responder)

    public_content = responder.await_args.kwargs["content"]
    assert public_content == "localized error (Reference: a1b2c3d4e5f6)"
    assert secret not in public_content
    logger.error.assert_called_once_with(
        "Command '%s' failed [reference=%s]",
        "update",
        "a1b2c3d4e5f6",
        exc_info=True,
    )


def test_sync_update_success_requires_restart_without_hot_reload(monkeypatch):
    monkeypatch.setattr(updater, "fetch_and_pull", lambda *args: (True, "updated"))

    success, message = updater.perform_update("owner/repo")

    assert success is True
    assert "重啟" in message
    assert "套用變更" in message
    assert "重新載入" not in message


def test_sync_update_rejects_concurrent_git_without_waiting(monkeypatch):
    worker_entered = threading.Event()
    release_worker = threading.Event()
    git_calls = 0

    def blocking_fetch(*args):
        nonlocal git_calls
        git_calls += 1
        worker_entered.set()
        if not release_worker.wait(timeout=2):
            raise TimeoutError("test did not release synchronous Git worker")
        return True, "updated"

    monkeypatch.setattr(updater, "fetch_and_pull", blocking_fetch)
    first_result = []
    first = threading.Thread(
        target=lambda: first_result.append(updater.perform_update("owner/repo")),
        daemon=True,
    )

    first.start()
    try:
        assert worker_entered.wait(timeout=1)
        started = time.monotonic()
        competing_result = updater.perform_update("owner/repo")
        elapsed = time.monotonic() - started
    finally:
        release_worker.set()
        first.join(timeout=2)

    assert not first.is_alive()
    assert competing_result[0] is False
    assert "更新正在進行中" in competing_result[1]
    assert elapsed < 0.5
    assert git_calls == 1
    assert first_result[0][0] is True


@pytest.mark.asyncio
async def test_cancelled_update_releases_lease_only_after_worker_finishes(monkeypatch):
    worker_entered = threading.Event()
    release_worker = threading.Event()
    worker_finished = threading.Event()

    def blocking_git(**kwargs):
        worker_entered.set()
        try:
            if not release_worker.wait(timeout=2):
                raise TimeoutError("test did not release cancelled worker")
            return True, "updated"
        finally:
            worker_finished.set()

    monkeypatch.setattr(update_module, "_perform_git_update_unlocked", blocking_git)
    task = asyncio.create_task(
        update_module._run_update(
            github_repo="owner/repo",
            github_token="",
            branch="main",
            auto_restart=False,
        )
    )

    try:
        assert await asyncio.to_thread(worker_entered.wait, 1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert updater.begin_update() is None
    finally:
        release_worker.set()
        assert await asyncio.to_thread(worker_finished.wait, 2)

    next_lease = None
    for _ in range(100):
        next_lease = updater.begin_update()
        if next_lease is not None:
            break
        await asyncio.sleep(0.01)

    assert next_lease is not None
    next_lease.release()


def test_update_lease_release_is_idempotent():
    first_lease = updater.begin_update()
    assert first_lease is not None
    first_lease.release()

    second_lease = updater.begin_update()
    assert second_lease is not None
    try:
        first_lease.release()
        assert updater.begin_update() is None
    finally:
        second_lease.release()


@pytest.mark.asyncio
async def test_worker_error_releases_update_lease(monkeypatch):
    def failing_git(**kwargs):
        raise RuntimeError("worker failed")

    monkeypatch.setattr(update_module, "_perform_git_update_unlocked", failing_git)

    with pytest.raises(RuntimeError, match="worker failed"):
        await update_module._run_update(
            github_repo="owner/repo",
            github_token="",
            branch="main",
            auto_restart=False,
        )

    next_lease = updater.begin_update()
    assert next_lease is not None
    next_lease.release()
