# Shared Database Config

此資料夾提供 `discord-part`（Discord Bot）同 `website-part` 共用嘅 MySQL
連線設定。

## 建立設定

Linux/macOS：

```bash
cp shared/database/config.example.json shared/database/config.json
```

Windows PowerShell：

```powershell
Copy-Item shared\database\config.example.json shared\database\config.json
```

編輯 `config.json` 入面嘅 `mysql` 或 `mysql_config` 物件。`config.json` 包含真實密碼，唔應該
提交到 Git；`config.example.json` 只放安全範例值。

## Python (`discord-part`)

Discord 程式碼透過現有 wrapper 取得連線：

```python
from utils.database import get_db_conn

connection = get_db_conn()
```

## Node.js (`website-part`)

網站由 `src/db/pool.js` 載入同一份 `shared/database/config.json`，並喺
server listen 前執行 website schema migrations。毋須喺 `.env` 重複設定 MySQL。

## Schema 同 migration 邊界

兩個 runtime 共用同一個 database，但使用不同 migration ledger：

- Discord Bot 使用 `schema_migrations`，啟動時建立 Bot 功能所需嘅 guild log、roller、
  private voice、self-role、活動統計、guild metadata 同 channel metadata，並將
  `website_announcements` 的 status 欄位擴充至可由 dispatcher claim。
- Website 使用 `website_schema_migrations`，啟動時建立 website users、roles、sessions、
  connections、events、Discord link、公告、remote profile 同 page visibility 表。
- `guild_activity_stats`、`discord_guild_metadata`、`discord_guild_channels` 同
  `website_events` 係跨 runtime 共用資料；Bot 寫入 Discord 狀態，Website 讀取及管理
  對應網站功能。

首次部署時，先確保 MySQL 帳戶有建立 database、建立表、加欄位及建立 foreign key
所需權限。全新 database 必須先啟動 Website 一次，再啟動 Bot，因為 Bot 嘅公告
migration 會更新由 Website migration 建立嘅 `website_announcements`。已有兩套
migration ledger 嘅資料庫就可以按任意次序啟動。兩邊 migration 都係 idempotent；
唔需要手動執行 SQL 或共用同一個 migration version table。

## 設定格式

loader 同時接受以下兩種 root key，現有範本使用 `mysql_config`：

```json
{
  "mysql_config": {
    "host": "localhost",
    "port": 3306,
    "user": "liulianbot",
    "password": "replace-me",
    "database": "discordbot",
    "charset": "utf8mb4"
  }
}
```

網站 Node.js pool 會將 timezone 固定為 UTC；網站活動及公告嘅時間輸入由前端轉成
ISO timestamp 後儲存。Discord ID 使用 MySQL `BIGINT`，Node.js 以字串處理大數字，
避免 JavaScript number 精度問題。

## 驗證

資料庫 repository 測試唔需要 live MySQL；可由專案根目錄執行：

```bash
python -m pytest -q
python -m ruff check discord-part shared
cd website-part
npm run check
```

`config.json` 只可以喺本機或部署環境建立，唔好提交；Bot token、Website
`SESSION_SECRET` 同 database password 都應該使用獨立嘅秘密管理方式保存。
