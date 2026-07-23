"""
動態更新模組 - 從 GitHub 儲存庫拉取最新程式碼。

支援：
- 公開儲存庫（無需 token）
- 私人儲存庫（使用 GitHub Personal Access Token 驗證）
- 安全的 fast-forward 更新
- 更新後重新啟動 bot 套用變更

設定 (config.json):
    # 公開 repo（僅需 github_repo）:
    "updater": {
        "github_repo": "owner/repo",
        "branch": "master",
        "auto_restart": false
    }

    # 私人 repo（需 token）:
    "updater": {
        "github_repo": "owner/repo",
        "github_token": "ghp_xxxxxxxxxxxx",
        "branch": "master",
        "auto_restart": false
    }
"""

import base64
import logging
import os
import subprocess
import sys
import threading
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)
UPDATE_BUSY_MESSAGE = "❌ 更新正在進行中，請稍後再試。"
RESTART_REQUIRED_MESSAGE = "✅ 檔案已更新；必須重啟 bot 才能套用變更。"
AUTO_RESTART_MESSAGE = "♻️ auto_restart 已啟用，bot 程序將自動重啟..."

if "_update_lock" not in globals():
    _update_lock = threading.Lock()


class _UpdateLease:
    """Own one update slot and release it at most once."""

    def __init__(self, update_lock):
        self._update_lock = update_lock
        self._release_lock = threading.Lock()
        self._released = False

    def release(self) -> None:
        with self._release_lock:
            if self._released:
                return
            self._released = True
            self._update_lock.release()


def begin_update() -> Optional[_UpdateLease]:
    """Non-blockingly acquire the process-wide update lease."""
    update_lock = _update_lock
    if not update_lock.acquire(blocking=False):
        return None
    return _UpdateLease(update_lock)


# ---------------------------------------------------------------------------
# Git 操作
# ---------------------------------------------------------------------------

def _get_repo_root() -> Path:
    """取得 git 儲存庫根目錄（自動向上尋找 .git 資料夾）。"""
    current = Path(__file__).resolve().parent
    # 向上尋找包含 .git 的目錄
    for _ in range(5):
        if (current / ".git").exists():
            return current
        current = current.parent
    # fallback: 假設是 discord-part 的上一層
    return Path(__file__).resolve().parent.parent


def _run_git(
    args: list[str],
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> Tuple[int, str, str]:
    """執行 git 指令並回傳 (returncode, stdout, stderr)。

    Args:
        args: git 指令參數列表（不含 "git"）
        cwd: 工作目錄，預設為 repo root
        env: 僅傳給此 Git 子程序的環境變數覆寫

    Returns:
        (returncode, stdout, stderr)
    """
    if cwd is None:
        cwd = _get_repo_root()

    cmd = ["git"] + args
    child_env = None
    if env is not None:
        child_env = os.environ.copy()
        child_env.update(env)

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=120,
            env=child_env,
        )
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", "Git command timed out (120s)"
    except FileNotFoundError:
        return -1, "", "git 指令不存在，請確認已安裝 Git 並加入 PATH"
    except Exception as e:
        return -1, "", str(e)


def _fetch_args(branch: str) -> list[str]:
    """建立會同步 origin remote-tracking ref 的 fetch 參數。"""
    refspec = f"+refs/heads/{branch}:refs/remotes/origin/{branch}"
    return ["fetch", "origin", refspec]


def _fetch_env(token: str) -> dict[str, str] | None:
    """建立只供單次 authenticated fetch 使用的 Git 設定環境。"""
    if not token:
        return None

    credential = base64.b64encode(f"x-access-token:{token}".encode()).decode("ascii")
    return {
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "http.extraHeader",
        "GIT_CONFIG_VALUE_0": f"Authorization: Basic {credential}",
    }


def _redact_git_output(output: str, token: str) -> str:
    """避免 Git 錯誤輸出洩漏 token 或其 Basic auth credential。"""
    if not token:
        return output

    credential = base64.b64encode(f"x-access-token:{token}".encode()).decode("ascii")
    return output.replace(token, "***").replace(credential, "***")


def get_current_branch() -> Optional[str]:
    """取得目前所在的 git 分支名稱。"""
    rc, stdout, stderr = _run_git(["rev-parse", "--abbrev-ref", "HEAD"])
    if rc == 0 and stdout:
        return stdout
    return None


def get_latest_commit() -> Optional[str]:
    """取得目前 HEAD 的 commit hash（短格式）。"""
    rc, stdout, stderr = _run_git(["rev-parse", "--short", "HEAD"])
    if rc == 0 and stdout:
        return stdout
    return None


def fetch_and_pull(
    github_repo: str,
    github_token: str = "",
    branch: str = "master",
) -> Tuple[bool, str]:
    """從 GitHub 儲存庫拉取最新程式碼。

    公開 repo 不需提供 token；私人 repo 請提供 GitHub PAT。

    Args:
        github_repo: GitHub 儲存庫全名，如 "owner/repo"
        github_token: GitHub Personal Access Token（公開 repo 可留空）
        branch: 要拉取的分支名稱

    Returns:
        (success: bool, message: str)
    """
    repo_root = _get_repo_root()

    # 檢查是否為 git 儲存庫
    if not (repo_root / ".git").exists():
        return False, "目前目錄不是 git 儲存庫"

    # 更新前先拒絕未提交內容，避免自動更新覆蓋本地工作。
    rc, stdout, stderr = _run_git(["status", "--porcelain"], cwd=repo_root)
    if rc != 0:
        detail = _redact_git_output(stderr, github_token)
        return False, f"檢查工作目錄狀態失敗: {detail}"
    if stdout:
        return False, "偵測到未提交的變更，已停止更新；請先提交或自行處理變更"

    remote_url = f"https://github.com/{github_repo}.git"

    # 記錄更新前的 commit
    old_commit = get_latest_commit()

    steps: list[str] = []

    # 1. 設定 remote URL
    rc, stdout, stderr = _run_git(
        ["remote", "set-url", "origin", remote_url], cwd=repo_root
    )
    if rc != 0:
        detail = _redact_git_output(stderr, github_token)
        return False, f"設定 remote URL 失敗: {detail}"
    steps.append(f"✓ 已設定 remote URL: {remote_url}")

    # 2. Fetch 最新變更
    rc, stdout, stderr = _run_git(
        _fetch_args(branch), cwd=repo_root, env=_fetch_env(github_token)
    )
    if rc != 0:
        detail = _redact_git_output(stderr, github_token)
        return False, f"Fetch 失敗: {detail}"
    steps.append(f"✓ Fetch {branch} 完成")

    # 3. 只允許 fast-forward，避免自動建立 merge commit 或覆蓋本地歷史。
    rc, stdout, stderr = _run_git(
        ["merge", "--ff-only", "FETCH_HEAD"], cwd=repo_root
    )
    if rc != 0:
        detail = _redact_git_output(stderr, github_token)
        return False, f"無法以 fast-forward 合併，更新已停止且工作目錄未修改: {detail}"
    steps.append("✓ git merge --ff-only FETCH_HEAD 完成")

    # 4. 取得新 commit
    new_commit = get_latest_commit()

    if old_commit == new_commit:
        return True, f"已是最新版本 (commit: {old_commit})\n" + "\n".join(steps)

    steps.append(f"\n更新摘要: {old_commit or '???'} → {new_commit or '???'}")

    return True, "\n".join(steps)


def _perform_git_update_unlocked(
    github_repo: str,
    github_token: str = "",
    branch: str = "master",
) -> Tuple[bool, str]:
    """執行 credential-safe Git 更新，不重新載入 Python 模組。

    Args:
        github_repo: GitHub 儲存庫全名
        github_token: GitHub Personal Access Token（公開 repo 可留空）
        branch: 分支名稱

    Returns:
        (success: bool, message: str)
    """
    # 步驟 1: Git 更新
    success, msg = fetch_and_pull(github_repo, github_token, branch)
    if not success:
        return False, f"❌ 更新失敗:\n{msg}"

    return True, msg


def format_update_success(message: str, auto_restart: bool) -> str:
    """Add restart guidance after files have been updated successfully."""
    message += f"\n\n{RESTART_REQUIRED_MESSAGE}"
    if auto_restart:
        message += f"\n\n{AUTO_RESTART_MESSAGE}"
    return message


def perform_update(
    github_repo: str,
    github_token: str = "",
    branch: str = "master",
    auto_restart: bool = False,
) -> Tuple[bool, str]:
    """同步相容入口：執行 Git 更新後重新載入模組。"""
    lease = begin_update()
    if lease is None:
        return False, UPDATE_BUSY_MESSAGE

    try:
        success, msg = _perform_git_update_unlocked(
            github_repo=github_repo,
            github_token=github_token,
            branch=branch,
        )
        if not success:
            return False, msg

        return True, format_update_success(msg, auto_restart)
    finally:
        lease.release()


def restart_bot() -> None:
    """重啟 bot 程序 — 透過呼叫專案根目錄的 start.sh。

    會自動偵測 bash 路徑（Linux/macOS 直接用 bash，Windows 優先找 Git Bash）。
    若找不到 bash 則降級為直接啟動 Python 程序。
    """
    repo_root = _get_repo_root()
    start_script = repo_root / "start.sh"

    # 優先使用 start.sh
    if start_script.is_file():
        # 尋找可用的 bash
        bash_cmd: Optional[str] = None

        if os.name != "nt":
            # Linux / macOS：直接用 bash
            bash_cmd = "bash"
            
        else:
            # Windows：依序尋找 Git Bash → WSL → 略過
            for candidate in (
                r"C:\Program Files\Git\bin\bash.exe",
                r"C:\Program Files (x86)\Git\bin\bash.exe",
                "bash",  # PATH 中有 Git Bash
                "wsl",
            ):
                rc, _, _ = _run_git([])  # reuse helper to test command
                # 改用 subprocess 直接測
                try:
                    subprocess.run(
                        [candidate, "--version"],
                        capture_output=True,
                        timeout=5,
                    )
                    bash_cmd = candidate
                    break
                except Exception:
                    continue

        if bash_cmd:
            logger.info(f"透過 {bash_cmd} {start_script} restart 重啟...")
            if bash_cmd == "wsl":
                # wsl 需要轉換路徑
                subprocess.Popen(
                    [bash_cmd, "bash", str(start_script), "restart"],
                    start_new_session=True,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                subprocess.Popen(
                    [bash_cmd, str(start_script), "restart"],
                    start_new_session=True,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        else:
            # 降級：直接啟動 Python
            logger.warning("找不到 bash，改用直接啟動 Python 程序")
            subprocess.Popen(
                [sys.executable] + sys.argv,
                start_new_session=True,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    else:
        # start.sh 不存在，降級為直接 Python 重啟
        logger.warning("找不到 start.sh")
        pass

    # 使用 os._exit 確保在 async 環境中也能確實終止程序
    # （sys.exit 在 asyncio 事件迴圈中會被捕獲，無法退出）
    os._exit(0)
