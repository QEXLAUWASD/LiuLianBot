"""
動態更新模組 - 從 GitHub 儲存庫拉取最新程式碼。

支援：
- 公開儲存庫（無需 token）
- 私人儲存庫（使用 GitHub Personal Access Token 驗證）
- git pull 更新
- 更新後重新載入 Python 模組

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

import subprocess
import sys
import os
import importlib
import logging
from typing import Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)


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


def _run_git(args: list[str], cwd: Path | None = None) -> Tuple[int, str, str]:
    """執行 git 指令並回傳 (returncode, stdout, stderr)。

    Args:
        args: git 指令參數列表（不含 "git"）
        cwd: 工作目錄，預設為 repo root

    Returns:
        (returncode, stdout, stderr)
    """
    if cwd is None:
        cwd = _get_repo_root()

    cmd = ["git"] + args
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=120,
        )
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", "Git command timed out (120s)"
    except FileNotFoundError:
        return -1, "", "git 指令不存在，請確認已安裝 Git 並加入 PATH"
    except Exception as e:
        return -1, "", str(e)


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

    # 建構 remote URL（有 token 用私人驗證，無 token 用公開 URL）
    if github_token:
        remote_url = f"https://{github_token}@github.com/{github_repo}.git"
        display_url = f"https://***@github.com/{github_repo}.git"
    else:
        remote_url = f"https://github.com/{github_repo}.git"
        display_url = remote_url

    # 記錄更新前的 commit
    old_commit = get_latest_commit()

    steps: list[str] = []

    # 1. 設定 remote URL
    rc, stdout, stderr = _run_git(["remote", "set-url", "origin", remote_url])
    if rc != 0:
        return False, f"設定 remote URL 失敗: {stderr}"
    steps.append(f"✓ 已設定 remote URL: {display_url}")

    # 2. Fetch 最新變更
    rc, stdout, stderr = _run_git(["fetch", "origin", branch])
    if rc != 0:
        return False, f"Fetch 失敗: {stderr}"
    steps.append(f"✓ Fetch {branch} 完成")

    # 3. 檢查是否有更新
    rc, stdout, stderr = _run_git(
        ["rev-list", "--count", f"HEAD..origin/{branch}"]
    )
    if rc == 0 and stdout == "0":
        return True, f"已是最新版本 (commit: {old_commit})\n" + "\n".join(steps)

    # 4. 儲存本地變更（stash）
    rc, stdout, stderr = _run_git(["stash", "push", "--include-untracked", "-m", "auto-stash before update"])
    stash_applied = (rc == 0 and "No local changes" not in stdout)
    if stash_applied:
        steps.append("✓ 已暫存本地變更 (stash)")

    # 5. Pull / reset
    rc, stdout, stderr = _run_git(["reset", "--hard", f"origin/{branch}"])
    if rc != 0:
        # 嘗試 merge
        rc2, stdout2, stderr2 = _run_git(["pull", "origin", branch])
        if rc2 != 0:
            return False, f"Pull 失敗: {stderr2}"
        steps.append(f"✓ git pull 完成: {stdout2}")
    else:
        steps.append(f"✓ git reset --hard origin/{branch} 完成")

    # 6. 取得新 commit
    new_commit = get_latest_commit()

    steps.append(f"\n更新摘要: {old_commit or '???'} → {new_commit or '???'}")

    return True, "\n".join(steps)


def reload_modules() -> Tuple[int, list[str]]:
    """重新載入所有 discord-part 下的自訂模組。

    走訪所有已載入的模組，將屬於此專案的模組重新載入。

    Returns:
        (reloaded_count, list_of_module_names)
    """
    project_prefixes = [
        "command.",
        "features.",
        "utils.",
        "core.",
        "updater.",
    ]

    reloaded = []

    # 先收集要重載的模組（避免在迭代時修改 dict）
    modules_to_reload = []
    for name, module in sorted(sys.modules.items()):
        if any(name.startswith(prefix) for prefix in project_prefixes):
            modules_to_reload.append(name)
        # 也包含直接匹配的頂層模組
        elif name in ("command", "features", "utils", "core", "updater"):
            modules_to_reload.append(name)

    for name in modules_to_reload:
        try:
            importlib.reload(sys.modules[name])
            reloaded.append(name)
        except Exception as e:
            logger.warning(f"重載模組 {name} 失敗: {e}")

    return len(reloaded), reloaded


def perform_update(
    github_repo: str,
    github_token: str = "",
    branch: str = "master",
    auto_restart: bool = False,
) -> Tuple[bool, str]:
    """執行完整的更新流程：git pull → 重新載入模組 → 可選重啟。

    Args:
        github_repo: GitHub 儲存庫全名
        github_token: GitHub Personal Access Token（公開 repo 可留空）
        branch: 分支名稱
        auto_restart: 是否在更新後自動重啟 bot 程序

    Returns:
        (success: bool, message: str)
    """
    # 步驟 1: Git pull
    success, msg = fetch_and_pull(github_repo, github_token, branch)
    if not success:
        return False, f"❌ 更新失敗:\n{msg}"

    # 步驟 2: 重新載入模組
    count, modules = reload_modules()
    msg += f"\n\n🔄 已重新載入 {count} 個模組"

    if auto_restart:
        msg += "\n\n♻️ auto_restart 已啟用，bot 程序將自動重啟..."

    return True, msg


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
