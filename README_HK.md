# LiuLianBot

此倉庫保留 Discord Bot 與 Android App。網站已移至 [QEXLAUWASD/LiuLianWEB](https://github.com/QEXLAUWASD/LiuLianWEB)，網站部署、前端與 API 文件請參閱新倉庫。需要 Python 3.11+ 與 MySQL 8+。

### Discord 機械人

- 《彩虹六號：圍攻》地圖、幹員同地圖資訊指令
- 可設定抽選頻道，支援根據身份組隨機揀選
- 臨時私人語音頻道，支援轉移擁有權同自動清理空頻道
- 記錄訊息、語音狀態、成員、頻道、身份組同伺服器事件；被其他使用者或管理員強制移動語音頻道時會記錄操作者；如部分 discord.py 版本忽略 `member_move` filter，Bot 會再掃描最近 Audit Log 作備援。
- 每個伺服器可獨立揀英文或繁體中文（`zh_TW`）
- Bot 擁有者、Bot 管理員、伺服器擁有者、伺服器管理員同一般用戶嘅分層權限
- 前綴指令同自動註冊嘅 slash 指令共用同一套處理器
- 可透過 Git 從已設定嘅儲存庫分支更新程式碼

### 1. 設定 Discord 機械人

從範本建立 `discord-part/config.json`。將 `token` 設為 Bot Token，並將範例 Discord 用戶 ID 換成真實 ID。

```bash
cp discord-part/default_config.json discord-part/config.json
```

Windows PowerShell：

```powershell
Copy-Item discord-part\default_config.json discord-part\config.json
```

重要 Bot 設定：

| 設定 | 用途 |
|---|---|
| `token` | Discord Bot Token |
| `prefix` | 文字指令前綴；預設係 `>` |
| `bot_owner` | 擁有完整 Bot 存取權嘅 Discord 用戶 ID |
| `bot_admin` | 有跨伺服器管理權嘅 Discord 用戶 ID |
| `guild_admins` | 可選嘅個別伺服器管理員 ID |
| `activity` | Discord 顯示嘅活動 |
| `updater` | `>update` 使用嘅儲存庫、分支及重啟設定 |

#### 管理事件 Audit Log 記錄

使用 `>setlogchannel all #channel`（或者 `channelaction`、`roleaction` 等分類）設定記錄頻道。
Bot 會讀取 Discord Audit Log，並喺管理事件 embed 顯示操作者嘅 mention 同 ID。頻道權限變更會另外查詢 permission-overwrite Audit Log，因為 Discord 會將呢類變更分開記錄。Bot
需要 **View Audit Log** 權限；事件後 Bot 會重試約五秒，等待 Audit Log 同步。如果仍然無法取得，事件仍然會記錄，操作者會顯示為
「未知（Audit Log 無法取得或尚未同步）」。請將權限授予 Bot 使用緊嘅身份組，而唔只係執行變更嘅管理員。
如果 Audit Log 查詢出現非預期錯誤，Bot 主控台日誌會顯示伺服器 ID 同 Python 例外詳情，方便診斷。
查詢同時接受 Discord 動作列舉、名稱（例如 `channel_update`）、數值或數字字串（例如 `10`、`11`、`12`），以及帶有整數 `value` 嘅相容列舉物件。任何非負數值動作都會直接傳畀 Discord API，即使部署環境嘅 discord.py 尚未定義較新動作值。

### 2. 設定共用資料庫

Bot 同網站都會讀取 `shared/database/config.json` 入面嘅 MySQL 設定。由已追蹤嘅範本建立檔案，再換掉範例帳密。

```bash
cp shared/database/config.example.json shared/database/config.json
```

Windows PowerShell：

```powershell
Copy-Item shared\database\config.example.json shared\database\config.json
```

範本使用以下結構：

```json
{
  "mysql": {
    "host": "localhost",
    "port": 3306,
    "user": "liulianbot",
    "password": "replace-me",
    "database": "discordbot",
    "charset": "utf8mb4"
  }
}
```

只要 MySQL 帳戶有相關權限，Bot 會建立指定資料庫；網站首次連線時會建立並 migration 所需資料表。
如果係全新資料庫，請先啟動一次網站再啟動 Bot：Bot 嘅公告 migration 會更新
由網站 migration 建立嘅 `website_announcements`。已有兩套 migration ledger 嘅
資料庫就可以按任意次序啟動。

### 3. 安裝及執行 Discord 機械人

Windows PowerShell：

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r discord-part\requirements.txt
.\.venv\Scripts\python.exe discord-part\main.py
```

Linux 或 macOS：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r discord-part/requirements.txt
python discord-part/main.py
```

喺 Linux，先執行 `chmod +x start.sh`，之後亦可以用 `./start.sh` 管理 Bot 程序。

## Discord 指令

預設前綴係 `>`。前綴指令同 slash 指令共用同一套 handler。Slash 指令選項由
`discord-part/tools/interaction_args.json` 產生；新增帶參數指令時亦要同步更新
呢份 metadata。請使用 `>help` 或 Discord 指令選單查看個別用法。

| 存取級別 | 指令 |
|---|---|
| 一般用戶 | `>help`, `>getlang`, `>r6maproll`, `>r6opsroll`, `>getr6mapinfo`, `>roller`, `>roles`, `>role`, `>mypermissions`, `>listguildadmins`, `>transfervoice`, `>link`, `>events`, `>eventjoin`, `>eventleave`, `>eventteams` |
| 伺服器管理員 | `>setlang`, `>setlogchannel`, `>setprivatevoice`, `>setupvoice`, `>removeprivatevoice`, `>setrollerchannel`, `>setrollermode`, `>setselfrole`, `>removeselfrole`, `>announce` |
| 伺服器擁有者 | `>addguildadmin`, `>removeguildadmin`, `>guildpermissions` |
| Bot 擁有者 | `>addadmin`, `>removeadmin`, `>getinfo`, `>getserverlist`, `>r6update`, `>update` |


## Integration and checks

Both repositories need their own shared/database/config.json pointing to the same database. Initialize LiuLianWEB first on a fresh database, then start the bot.

```bash
python -m pip install -r discord-part/requirements-dev.txt
python -m pytest -q
python -m ruff check discord-part shared
python -m compileall -q discord-part shared
```

Android setup: [android-part/README.md](android-part/README.md). Never commit bot tokens or database credentials.

## License

This project is for personal and community use. All rights reserved.
