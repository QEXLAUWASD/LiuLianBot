import base64

from updater import updater


TOKEN = "ghp_super-secret-token"
PUBLIC_URL = "https://github.com/owner/repo.git"


def _prepare_repo(monkeypatch, tmp_path, responses):
    (tmp_path / ".git").mkdir()
    calls = []

    def fake_run_git(args, cwd=None):
        calls.append(args)
        return responses.get(tuple(args), (0, "", ""))

    monkeypatch.setattr(updater, "_get_repo_root", lambda: tmp_path)
    monkeypatch.setattr(updater, "_run_git", fake_run_git)
    return calls


def test_fetch_args_uses_ephemeral_basic_auth_header():
    credential = base64.b64encode(f"x-access-token:{TOKEN}".encode()).decode("ascii")

    args = updater._fetch_args(PUBLIC_URL, "main", TOKEN)

    assert args == [
        "-c",
        f"http.extraHeader=Authorization: Basic {credential}",
        "fetch",
        PUBLIC_URL,
        "main",
    ]
    assert TOKEN not in " ".join(args)


def test_fetch_args_without_token_uses_public_fetch():
    assert updater._fetch_args(PUBLIC_URL, "main", "") == [
        "fetch",
        PUBLIC_URL,
        "main",
    ]


def test_worktree_is_clean_requires_successful_empty_status(monkeypatch):
    monkeypatch.setattr(updater, "_run_git", lambda args: (0, "", ""))
    assert updater._worktree_is_clean() is True

    monkeypatch.setattr(updater, "_run_git", lambda args: (0, " M changed.py", ""))
    assert updater._worktree_is_clean() is False

    monkeypatch.setattr(updater, "_run_git", lambda args: (128, "", "status failed"))
    assert updater._worktree_is_clean() is False


def test_token_update_keeps_origin_public_and_fast_forwards(monkeypatch, tmp_path):
    credential = base64.b64encode(f"x-access-token:{TOKEN}".encode()).decode("ascii")
    fetch_args = (
        "-c",
        f"http.extraHeader=Authorization: Basic {credential}",
        "fetch",
        PUBLIC_URL,
        "main",
    )
    responses = {
        ("status", "--porcelain"): (0, "", ""),
        ("rev-parse", "--short", "HEAD"): (0, "abc1234", ""),
        fetch_args: (0, "", ""),
        ("merge", "--ff-only", "FETCH_HEAD"): (0, "Updating abc..def", ""),
    }
    calls = _prepare_repo(monkeypatch, tmp_path, responses)

    success, message = updater.fetch_and_pull("owner/repo", TOKEN, "main")

    assert success is True
    assert ["remote", "set-url", "origin", PUBLIC_URL] in calls
    assert list(fetch_args) in calls
    assert ["merge", "--ff-only", "FETCH_HEAD"] in calls
    assert calls.index(list(fetch_args)) < calls.index(["merge", "--ff-only", "FETCH_HEAD"])
    remote_call = next(args for args in calls if args[:3] == ["remote", "set-url", "origin"])
    assert TOKEN not in " ".join(remote_call)
    assert TOKEN not in message
    assert credential not in message


def test_public_update_fetches_without_auth_config(monkeypatch, tmp_path):
    responses = {
        ("status", "--porcelain"): (0, "", ""),
        ("rev-parse", "--short", "HEAD"): (0, "abc1234", ""),
        ("fetch", PUBLIC_URL, "main"): (0, "", ""),
        ("merge", "--ff-only", "FETCH_HEAD"): (0, "Already up to date.", ""),
    }
    calls = _prepare_repo(monkeypatch, tmp_path, responses)

    success, message = updater.fetch_and_pull("owner/repo", branch="main")

    assert success is True
    assert "已是最新版本" in message
    assert ["fetch", PUBLIC_URL, "main"] in calls
    assert not any("http.extraHeader" in part for args in calls for part in args)


def test_dirty_worktree_is_rejected_before_remote_or_update_commands(monkeypatch, tmp_path):
    calls = _prepare_repo(
        monkeypatch,
        tmp_path,
        {("status", "--porcelain"): (0, " M discord-part/main.py", "")},
    )

    success, message = updater.fetch_and_pull("owner/repo", TOKEN, "main")

    assert success is False
    assert "未提交" in message
    assert calls == [["status", "--porcelain"]]


def test_status_failure_is_not_reported_as_dirty(monkeypatch, tmp_path):
    calls = _prepare_repo(
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
    fetch_args = (
        "-c",
        f"http.extraHeader=Authorization: Basic {credential}",
        "fetch",
        PUBLIC_URL,
        "main",
    )
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
    calls = _prepare_repo(monkeypatch, tmp_path, responses)

    success, message = updater.fetch_and_pull("owner/repo", TOKEN, "main")

    assert success is False
    assert "已停止" in message
    assert "未修改" in message
    assert TOKEN not in message
    assert credential not in message
    assert not any(args and args[0] in {"pull", "stash", "reset"} for args in calls)


def test_fetch_failure_redacts_token_and_encoded_credential(monkeypatch, tmp_path):
    credential = base64.b64encode(f"x-access-token:{TOKEN}".encode()).decode("ascii")
    fetch_args = (
        "-c",
        f"http.extraHeader=Authorization: Basic {credential}",
        "fetch",
        PUBLIC_URL,
        "main",
    )
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
