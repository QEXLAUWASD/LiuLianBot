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


def test_update_coordinator_shields_only_git_work_in_thread():
    assert hasattr(update_module, "_run_update")
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
        for node in ast.walk(call)
    )
    assert any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "reload_modules"
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
    monkeypatch.setattr(update_module, "_run_update", coordinator, raising=False)
    channel = SimpleNamespace(send=AsyncMock())
    message = SimpleNamespace(author=SimpleNamespace(id=42), channel=channel)

    await update_module.update(message, SimpleNamespace())

    coordinator.assert_awaited_once_with(
        github_repo="owner/private-repo",
        github_token="token-value",
        branch="release",
        auto_restart=False,
    )
    assert channel.send.await_count == 2
    result_embed = channel.send.await_args_list[1].kwargs["embed"]
    assert result_embed.title == "❌ 更新失敗"
    assert result_embed.description == "```\nupdate failed safely\n```"


@pytest.mark.asyncio
async def test_git_runs_in_worker_and_module_reload_runs_on_event_loop(monkeypatch):
    assert hasattr(update_module, "_run_update")
    event_loop_thread = threading.get_ident()
    git_threads = []
    reload_threads = []

    def fake_git_update(**kwargs):
        git_threads.append(threading.get_ident())
        return True, "updated"

    def fake_reload_modules():
        reload_threads.append(threading.get_ident())
        return 3, ["commands.one", "features.two", "updater.updater"]

    monkeypatch.setattr(
        update_module,
        "_perform_git_update_unlocked",
        fake_git_update,
        raising=False,
    )
    monkeypatch.setattr(update_module, "reload_modules", fake_reload_modules)

    success, message = await update_module._run_update(
        github_repo="owner/repo",
        github_token="",
        branch="main",
        auto_restart=False,
    )

    assert success is True
    assert git_threads and git_threads[0] != event_loop_thread
    assert reload_threads == [event_loop_thread]
    assert "已重新載入 3 個模組" in message


@pytest.mark.asyncio
async def test_failed_git_does_not_reload_modules(monkeypatch):
    assert hasattr(update_module, "_run_update")
    reload_modules = Mock()
    monkeypatch.setattr(
        update_module,
        "_perform_git_update_unlocked",
        lambda **kwargs: (False, "update failed safely"),
        raising=False,
    )
    monkeypatch.setattr(update_module, "reload_modules", reload_modules)

    result = await update_module._run_update(
        github_repo="owner/repo",
        github_token="",
        branch="main",
        auto_restart=False,
    )

    assert result == (False, "update failed safely")
    reload_modules.assert_not_called()


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


def test_sync_update_holds_lease_through_reload(monkeypatch):
    assert hasattr(updater, "begin_update")
    reload_entered = threading.Event()
    release_reload = threading.Event()
    count_lock = threading.Lock()
    git_calls = 0
    reload_calls = 0

    def fake_fetch(*args):
        nonlocal git_calls
        with count_lock:
            git_calls += 1
        return True, "updated"

    def blocking_reload():
        nonlocal reload_calls
        with count_lock:
            reload_calls += 1
            current_call = reload_calls
        if current_call == 1:
            reload_entered.set()
            if not release_reload.wait(timeout=2):
                raise TimeoutError("test did not release synchronous reload")
        return 1, ["updater.updater"]

    monkeypatch.setattr(updater, "fetch_and_pull", fake_fetch)
    monkeypatch.setattr(updater, "reload_modules", blocking_reload)
    first_result = []
    first = threading.Thread(
        target=lambda: first_result.append(updater.perform_update("owner/repo")),
        daemon=True,
    )

    first.start()
    try:
        assert reload_entered.wait(timeout=1)
        started = time.monotonic()
        competing_result = updater.perform_update("owner/repo")
        elapsed = time.monotonic() - started
    finally:
        release_reload.set()
        first.join(timeout=2)

    assert not first.is_alive()
    assert competing_result[0] is False
    assert "更新正在進行中" in competing_result[1]
    assert elapsed < 0.5
    assert git_calls == 1
    assert reload_calls == 1
    assert first_result == [(True, "updated\n\n🔄 已重新載入 1 個模組")]


def test_update_lock_and_active_lease_survive_module_reload():
    assert hasattr(updater, "begin_update")
    original_lock = updater._update_lock
    lease = updater.begin_update()
    assert lease is not None

    try:
        reloaded_module = importlib.reload(updater)
        assert reloaded_module._update_lock is original_lock
        assert reloaded_module.begin_update() is None
    finally:
        lease.release()

    next_lease = updater.begin_update()
    assert next_lease is not None
    next_lease.release()


@pytest.mark.asyncio
async def test_async_reload_keeps_lease_busy_for_other_threads(monkeypatch):
    assert hasattr(update_module, "_run_update")
    assert hasattr(updater, "begin_update")
    reload_entered = threading.Event()
    release_reload = threading.Event()
    probe_results = []

    monkeypatch.setattr(
        update_module,
        "_perform_git_update_unlocked",
        lambda **kwargs: (True, "updated"),
        raising=False,
    )

    def blocking_reload():
        reload_entered.set()
        if not release_reload.wait(timeout=2):
            raise TimeoutError("test probe did not release async reload")
        return 1, ["updater.updater"]

    def probe_lease():
        if not reload_entered.wait(timeout=1):
            probe_results.append("reload timeout")
        else:
            lease = updater.begin_update()
            probe_results.append(lease)
            if lease is not None:
                lease.release()
        release_reload.set()

    monkeypatch.setattr(update_module, "reload_modules", blocking_reload)
    probe = threading.Thread(target=probe_lease, daemon=True)
    probe.start()
    result = await update_module._run_update(
        github_repo="owner/repo",
        github_token="",
        branch="main",
        auto_restart=False,
    )
    probe.join(timeout=2)

    assert not probe.is_alive()
    assert probe_results == [None]
    assert result == (True, "updated\n\n🔄 已重新載入 1 個模組")


@pytest.mark.asyncio
async def test_cancelled_update_releases_lease_only_after_worker_finishes(monkeypatch):
    assert hasattr(update_module, "_run_update")
    assert hasattr(updater, "begin_update")
    worker_entered = threading.Event()
    release_worker = threading.Event()
    worker_finished = threading.Event()
    reload_modules = Mock()

    def blocking_git(**kwargs):
        worker_entered.set()
        try:
            if not release_worker.wait(timeout=2):
                raise TimeoutError("test did not release cancelled worker")
            return True, "updated"
        finally:
            worker_finished.set()

    monkeypatch.setattr(
        update_module,
        "_perform_git_update_unlocked",
        blocking_git,
        raising=False,
    )
    monkeypatch.setattr(update_module, "reload_modules", reload_modules)
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
    reload_modules.assert_not_called()


def test_update_lease_release_is_idempotent():
    assert hasattr(updater, "begin_update")
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
    assert hasattr(update_module, "_run_update")
    assert hasattr(updater, "begin_update")
    reload_modules = Mock()

    def failing_git(**kwargs):
        raise RuntimeError("worker failed")

    monkeypatch.setattr(
        update_module,
        "_perform_git_update_unlocked",
        failing_git,
        raising=False,
    )
    monkeypatch.setattr(update_module, "reload_modules", reload_modules)

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
    reload_modules.assert_not_called()


@pytest.mark.asyncio
async def test_reload_error_releases_update_lease(monkeypatch):
    assert hasattr(update_module, "_run_update")
    assert hasattr(updater, "begin_update")
    monkeypatch.setattr(
        update_module,
        "_perform_git_update_unlocked",
        lambda **kwargs: (True, "updated"),
        raising=False,
    )
    monkeypatch.setattr(
        update_module,
        "reload_modules",
        Mock(side_effect=RuntimeError("reload failed")),
    )

    with pytest.raises(RuntimeError, match="reload failed"):
        await update_module._run_update(
            github_repo="owner/repo",
            github_token="",
            branch="main",
            auto_restart=False,
        )

    next_lease = updater.begin_update()
    assert next_lease is not None
    next_lease.release()
