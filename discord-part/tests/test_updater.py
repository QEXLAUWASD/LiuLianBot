import base64
import os
import subprocess
from types import SimpleNamespace

from updater import updater


TOKEN = "ghp_super-secret-token"
PUBLIC_URL = "https://github.com/owner/repo.git"
REFSPEC = "+refs/heads/main:refs/remotes/origin/main"


def _prepare_repo(monkeypatch, tmp_path, responses):
    (tmp_path / ".git").mkdir()
    calls = []
    environments = []

    def fake_run_git(args, cwd=None, env=None):
        calls.append(args)
        environments.append(env)
        return responses.get(tuple(args), (0, "", ""))

    monkeypatch.setattr(updater, "_get_repo_root", lambda: tmp_path)
    monkeypatch.setattr(updater, "_run_git", fake_run_git)
    return calls, environments


def test_fetch_args_uses_origin_and_updates_remote_tracking_ref():
    assert updater._fetch_args("main") == [
        "fetch",
        "origin",
        REFSPEC,
    ]


def test_authenticated_fetch_keeps_credentials_out_of_subprocess_argv(monkeypatch, tmp_path):
    (tmp_path / ".git").mkdir()
    credential = base64.b64encode(f"x-access-token:{TOKEN}".encode()).decode("ascii")
    invocations = []

    def fake_subprocess_run(command, **kwargs):
        invocations.append((command, kwargs.get("env")))
        stdout = "abc1234\n" if command[1:4] == ["rev-parse", "--short", "HEAD"] else ""
        return SimpleNamespace(returncode=0, stdout=stdout, stderr="")

    monkeypatch.setattr(updater, "_get_repo_root", lambda: tmp_path)
    monkeypatch.setattr(updater.subprocess, "run", fake_subprocess_run)
    original_environment = os.environ.copy()

    success, message = updater.fetch_and_pull("owner/repo", TOKEN, "main")

    assert success is True
    fetch_command, fetch_environment = next(
        invocation for invocation in invocations if invocation[0][1] == "fetch"
    )
    assert fetch_command == ["git", "fetch", "origin", REFSPEC]
    assert TOKEN not in " ".join(fetch_command)
    assert credential not in " ".join(fetch_command)
    assert fetch_environment["GIT_CONFIG_COUNT"] == "1"
    assert fetch_environment["GIT_CONFIG_KEY_0"] == "http.extraHeader"
    assert fetch_environment["GIT_CONFIG_VALUE_0"] == f"Authorization: Basic {credential}"
    assert all(env is None for command, env in invocations if command[1] != "fetch")
    assert os.environ == original_environment
    assert TOKEN not in message
    assert credential not in message


def test_token_update_keeps_origin_public_and_fast_forwards(monkeypatch, tmp_path):
    credential = base64.b64encode(f"x-access-token:{TOKEN}".encode()).decode("ascii")
    fetch_args = ("fetch", "origin", REFSPEC)
    responses = {
        ("status", "--porcelain"): (0, "", ""),
        ("rev-parse", "--short", "HEAD"): (0, "abc1234", ""),
        fetch_args: (0, "", ""),
        ("merge", "--ff-only", "FETCH_HEAD"): (0, "Updating abc..def", ""),
    }
    calls, environments = _prepare_repo(monkeypatch, tmp_path, responses)

    success, message = updater.fetch_and_pull("owner/repo", TOKEN, "main")

    assert success is True
    assert ["remote", "set-url", "origin", PUBLIC_URL] in calls
    assert list(fetch_args) in calls
    assert ["merge", "--ff-only", "FETCH_HEAD"] in calls
    assert calls.index(list(fetch_args)) < calls.index(["merge", "--ff-only", "FETCH_HEAD"])
    remote_call = next(args for args in calls if args[:3] == ["remote", "set-url", "origin"])
    assert TOKEN not in " ".join(remote_call)
    fetch_environment = environments[calls.index(list(fetch_args))]
    assert fetch_environment["GIT_CONFIG_KEY_0"] == "http.extraHeader"
    assert fetch_environment["GIT_CONFIG_VALUE_0"] == f"Authorization: Basic {credential}"
    assert all(
        env is None for index, env in enumerate(environments) if calls[index] != list(fetch_args)
    )
    assert TOKEN not in message
    assert credential not in message


def test_public_update_fetches_without_auth_config(monkeypatch, tmp_path):
    responses = {
        ("status", "--porcelain"): (0, "", ""),
        ("rev-parse", "--short", "HEAD"): (0, "abc1234", ""),
        ("fetch", "origin", REFSPEC): (0, "", ""),
        ("merge", "--ff-only", "FETCH_HEAD"): (0, "Already up to date.", ""),
    }
    calls, environments = _prepare_repo(monkeypatch, tmp_path, responses)

    success, message = updater.fetch_and_pull("owner/repo", branch="main")

    assert success is True
    assert "已是最新版本" in message
    assert ["fetch", "origin", REFSPEC] in calls
    assert all(environment is None for environment in environments)
    assert not any("http.extraHeader" in part for args in calls for part in args)


def test_dirty_worktree_is_rejected_before_remote_or_update_commands(monkeypatch, tmp_path):
    calls, _ = _prepare_repo(
        monkeypatch,
        tmp_path,
        {("status", "--porcelain"): (0, " M discord-part/main.py", "")},
    )

    success, message = updater.fetch_and_pull("owner/repo", TOKEN, "main")

    assert success is False
    assert "未提交" in message
    assert calls == [["status", "--porcelain"]]


def test_status_failure_is_not_reported_as_dirty(monkeypatch, tmp_path):
    calls, _ = _prepare_repo(
        monkeypatch,
        tmp_path,
        {("status", "--porcelain"): (128, "", "not a work tree")},
    )

    success, message = updater.fetch_and_pull("owner/repo", TOKEN, "main")

    assert success is False
    assert "檢查工作目錄狀態失敗" in message
    assert "not a work tree" in message
    assert "未提交" not in message
    assert calls == [["status", "--porcelain"]]


def test_non_fast_forward_stops_without_destructive_fallback(monkeypatch, tmp_path):
    credential = base64.b64encode(f"x-access-token:{TOKEN}".encode()).decode("ascii")
    fetch_args = ("fetch", "origin", REFSPEC)
    responses = {
        ("status", "--porcelain"): (0, "", ""),
        ("rev-parse", "--short", "HEAD"): (0, "abc1234", ""),
        fetch_args: (0, "", ""),
        ("merge", "--ff-only", "FETCH_HEAD"): (
            128,
            "",
            f"fatal: Not possible to fast-forward {TOKEN} {credential}",
        ),
    }
    calls, _ = _prepare_repo(monkeypatch, tmp_path, responses)

    success, message = updater.fetch_and_pull("owner/repo", TOKEN, "main")

    assert success is False
    assert "已停止" in message
    assert "未修改" in message
    assert TOKEN not in message
    assert credential not in message
    assert not any(args and args[0] in {"pull", "stash", "reset"} for args in calls)


def test_fetch_failure_redacts_token_and_encoded_credential(monkeypatch, tmp_path):
    credential = base64.b64encode(f"x-access-token:{TOKEN}".encode()).decode("ascii")
    fetch_args = ("fetch", "origin", REFSPEC)
    responses = {
        ("status", "--porcelain"): (0, "", ""),
        ("rev-parse", "--short", "HEAD"): (0, "abc1234", ""),
        fetch_args: (128, "", f"auth failed for {TOKEN} ({credential})"),
    }
    _prepare_repo(monkeypatch, tmp_path, responses)

    success, message = updater.fetch_and_pull("owner/repo", TOKEN, "main")

    assert success is False
    assert "Fetch 失敗" in message
    assert TOKEN not in message
    assert credential not in message


def _git(cwd, *args):
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def test_fetch_and_merge_updates_origin_tracking_ref_in_real_repository(tmp_path):
    remote = tmp_path / "remote.git"
    source = tmp_path / "source"
    local = tmp_path / "local"

    _git(tmp_path, "init", "--bare", str(remote))
    source.mkdir()
    _git(source, "init")
    _git(source, "checkout", "-b", "main")
    _git(source, "config", "user.name", "Updater Test")
    _git(source, "config", "user.email", "updater@example.invalid")
    (source / "version.txt").write_text("one\n", encoding="ascii")
    _git(source, "add", "version.txt")
    _git(source, "commit", "-m", "initial")
    _git(source, "remote", "add", "origin", str(remote))
    _git(source, "push", "-u", "origin", "main")
    _git(tmp_path, "--git-dir", str(remote), "symbolic-ref", "HEAD", "refs/heads/main")
    _git(tmp_path, "clone", str(remote), str(local))

    (source / "version.txt").write_text("two\n", encoding="ascii")
    _git(source, "add", "version.txt")
    _git(source, "commit", "-m", "update")
    expected_head = _git(source, "rev-parse", "HEAD")
    _git(source, "push", "origin", "main")

    rc, _, stderr = updater._run_git(updater._fetch_args("main"), cwd=local)
    assert rc == 0, stderr
    rc, _, stderr = updater._run_git(["merge", "--ff-only", "FETCH_HEAD"], cwd=local)
    assert rc == 0, stderr

    assert _git(local, "rev-parse", "HEAD") == expected_head
    assert _git(local, "rev-parse", "refs/remotes/origin/main") == expected_head
