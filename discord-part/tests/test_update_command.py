import asyncio
import ast
import importlib
import inspect
import threading
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from commands.owner import update as update_module
from core import bot_client
from updater import updater


def test_update_awaits_perform_update_in_thread():
    tree = ast.parse(inspect.getsource(update_module.update))

    awaited_calls = [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Await) and isinstance(node.value, ast.Call)
    ]
    to_thread_calls = [
        call
        for call in awaited_calls
        if isinstance(call.func, ast.Attribute)
        and isinstance(call.func.value, ast.Name)
        and call.func.value.id == "asyncio"
        and call.func.attr == "to_thread"
    ]

    assert len(to_thread_calls) == 1
    call = to_thread_calls[0]
    assert isinstance(call.args[0], ast.Name)
    assert call.args[0].id == "perform_update"
    assert {keyword.arg for keyword in call.keywords} == {
        "github_repo",
        "github_token",
        "branch",
        "auto_restart",
    }


@pytest.mark.asyncio
async def test_update_passes_configuration_to_thread_and_uses_result(monkeypatch):
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

    perform_update = Mock(name="perform_update")
    monkeypatch.setattr(update_module, "perform_update", perform_update)
    thread_calls = []

    async def fake_to_thread(func, *args, **kwargs):
        thread_calls.append((func, args, kwargs))
        return False, "update failed safely"

    monkeypatch.setattr(update_module.asyncio, "to_thread", fake_to_thread)

    channel = SimpleNamespace(send=AsyncMock())
    message = SimpleNamespace(
        author=SimpleNamespace(id=42),
        channel=channel,
    )

    await update_module.update(message, SimpleNamespace())

    assert thread_calls == [
        (
            perform_update,
            (),
            {
                "github_repo": "owner/private-repo",
                "github_token": "token-value",
                "branch": "release",
                "auto_restart": False,
            },
        )
    ]
    assert perform_update.call_count == 0
    assert channel.send.await_count == 2
    result_embed = channel.send.await_args_list[1].kwargs["embed"]
    assert result_embed.title == "❌ 更新失敗"
    assert result_embed.description == "```\nupdate failed safely\n```"


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
    client = SimpleNamespace(
        command_prefix=">",
        _cmd_handler=command_handler,
        logger=logger,
    )
    author = SimpleNamespace(id=42)
    message = SimpleNamespace(
        content=">update",
        author=author,
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
        raising=False,
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


def test_perform_update_rejects_concurrent_work_without_waiting(monkeypatch):
    entered = threading.Event()
    release = threading.Event()
    calls_lock = threading.Lock()
    call_count = 0

    def blocking_fetch(*args):
        nonlocal call_count
        with calls_lock:
            call_count += 1
            current_call = call_count
        if current_call == 1:
            entered.set()
            if not release.wait(timeout=2):
                raise TimeoutError("test did not release first update")
        return True, "updated"

    monkeypatch.setattr(updater, "fetch_and_pull", blocking_fetch)
    monkeypatch.setattr(updater, "reload_modules", lambda: (0, []))
    first_result = []
    first = threading.Thread(
        target=lambda: first_result.append(updater.perform_update("owner/repo")),
        daemon=True,
    )

    first.start()
    try:
        assert entered.wait(timeout=1)
        started = time.monotonic()
        competing_result = updater.perform_update("owner/repo")
        elapsed = time.monotonic() - started
    finally:
        release.set()
        first.join(timeout=2)

    assert not first.is_alive()
    assert competing_result[0] is False
    assert "更新正在進行中" in competing_result[1]
    assert elapsed < 0.5
    assert call_count == 1
    assert first_result == [(True, "updated\n\n🔄 已重新載入 0 個模組")]


def test_update_lock_identity_survives_module_reload():
    assert hasattr(updater, "_update_lock")
    original_lock = updater._update_lock

    reloaded_module = importlib.reload(updater)

    assert reloaded_module._update_lock is original_lock


@pytest.mark.asyncio
async def test_cancelled_waiter_does_not_release_worker_lock(monkeypatch):
    entered = threading.Event()
    release = threading.Event()
    worker_returned = threading.Event()
    calls_lock = threading.Lock()
    call_count = 0

    def blocking_fetch(*args):
        nonlocal call_count
        with calls_lock:
            call_count += 1
            current_call = call_count
        if current_call == 1:
            entered.set()
            if not release.wait(timeout=2):
                raise TimeoutError("test did not release cancelled worker")
        return True, "updated"

    def run_update():
        try:
            return updater.perform_update("owner/repo")
        finally:
            worker_returned.set()

    monkeypatch.setattr(updater, "fetch_and_pull", blocking_fetch)
    monkeypatch.setattr(updater, "reload_modules", lambda: (0, []))
    task = asyncio.create_task(asyncio.to_thread(run_update))

    try:
        assert await asyncio.to_thread(entered.wait, 1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        competing_result = await asyncio.wait_for(
            asyncio.to_thread(updater.perform_update, "owner/repo"),
            timeout=1,
        )
        assert competing_result[0] is False
        assert "更新正在進行中" in competing_result[1]
        assert not worker_returned.is_set()
    finally:
        release.set()
        assert await asyncio.to_thread(worker_returned.wait, 2)

    final_result = await asyncio.wait_for(
        asyncio.to_thread(updater.perform_update, "owner/repo"),
        timeout=1,
    )
    assert final_result[0] is True
    assert call_count == 2


def test_perform_update_releases_lock_after_worker_error(monkeypatch):
    assert hasattr(updater, "_update_lock")
    call_count = 0

    def failing_once(*args):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("worker failed")
        return True, "updated"

    monkeypatch.setattr(updater, "fetch_and_pull", failing_once)
    monkeypatch.setattr(updater, "reload_modules", lambda: (0, []))

    with pytest.raises(RuntimeError, match="worker failed"):
        updater.perform_update("owner/repo")

    assert not updater._update_lock.locked()
    assert updater.perform_update("owner/repo")[0] is True
    assert call_count == 2
