# LiuLianBot（榴槤 Bot）

LiuLianBot 係一個畀遊戲社群使用嘅 Discord 機械人同配套網站。提供《彩虹六號：圍攻》抽選、臨時私人語音頻道、伺服器事件記錄、可設定抽選系統，以及帳戶同連線管理網站。

## 功能

### Discord 機械人

- 《彩虹六號：圍攻》地圖、幹員同地圖資訊指令
- 可設定抽選頻道，支援根據身份組隨機揀選
- 臨時私人語音頻道，支援轉移擁有權同自動清理空頻道
- 記錄訊息、語音狀態、成員、頻道、身份組同伺服器事件
- 每個伺服器可獨立揀英文或繁體中文（`zh_TW`）
- Bot 擁有者、Bot 管理員、伺服器擁有者、伺服器管理員同一般用戶嘅分層權限
- 可透過 Git 從已設定嘅儲存庫分支更新程式碼

### 網站儀表板

- 註冊、登入、登出、改帳戶名稱、改密碼同持久登入 Session
- 管理員可以管理用戶、群組、伺服器資訊同網站連線
- 用戶群組同連線授權均支援多對多關係
- 已授權嘅 HTTP 及 WebSocket 代理連線
- 可隱藏連線：唔會出現喺導覽內，但已授權用戶仍可用直接網址存取
- 使用 MySQL 儲存 Session、限制登入嘗試，並會自動執行網站 migration
- R6 活動頁面：建立活動、查看報名人數、加入或退出活動
- 網站帳戶可產生一次性代碼，連結 Discord 身分後可共用活動報名資料

## 專案結構

```
LiuLianBot/
|-- discord-part/                 # Python Discord 機械人
|   |-- main.py                   # Bot 主入口
|   |-- default_config.json       # Bot 設定範本
|   |-- commands/                 # 前綴指令處理器
|   |-- core/                     # Bot 生命週期、設定與 Slash adapter
|   |-- features/                 # Discord 事件功能
|   |-- locales/                  # 英文及繁體中文字串
|   |-- tests/                    # Python 測試
|   |-- updater/                  # Git 更新功能
|   `-- utils/                    # 資料庫及日誌工具
|-- website-part/                 # Node.js / Express 網站
|   |-- public/                   # HTML、CSS 同瀏覽器端 JavaScript
|   |-- src/                      # App、路由、中介層、資料庫 repository 及服務
|   `-- test/                     # Node.js 測試
|-- shared/
|   |-- database/                 # 共用 MySQL 設定與範本
|   `-- r6/                       # R6 資料及爬蟲
|-- .github/workflows/            # CI 設定
|-- start.sh                      # Linux Bot 管理腳本
|-- PRIVACY_POLICY.md
`-- TERMS_OF_SERVICE.md
```

## 環境要求

- Python 3.10 或以上
- Node.js 18 或以上，以及 npm
- MySQL 或 MariaDB
- [Discord 開發者平台](https://discord.com/developers/applications)建立嘅 Bot Token

## 安裝

Clone 專案，之後設定 Bot 同共用資料庫連線。

```bash
git clone https://github.com/QEXLAUWASD/LiuLianBot.git
cd LiuLianBot
```

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

### 4. 安裝及執行網站

從範本建立網站環境檔。喺非本機開發環境，務必設定夠長而且唯一嘅 `SESSION_SECRET`。

```bash
cd website-part
cp .env.example .env
npm ci
npm start
```

Windows PowerShell：

```powershell
Set-Location website-part
Copy-Item .env.example .env
npm ci
npm start
```

網站預設喺 `http://localhost:3000` 運行。執行自動化測試：

```bash
npm test
```

## Discord 指令

預設前綴係 `>`。下表列出目前已註冊嘅指令處理器；請喺 Discord 使用 `>help` 查看個別指令用法。

| 存取級別 | 指令 |
|---|---|
| 一般用戶 | `>help`, `>getlang`, `>r6maproll`, `>r6opsroll`, `>getr6mapinfo`, `>roller`, `>mypermissions`, `>listguildadmins`, `>transfervoice`, `>link`, `>events`, `>eventjoin`, `>eventleave`, `>eventteams` |
| 伺服器管理員 | `>setlang`, `>setlogchannel`, `>setprivatevoice`, `>setupvoice`, `>removeprivatevoice`, `>setrollerchannel`, `>setrollermode`, `>setselfrole`, `>removeselfrole`, `>announce` |
| 伺服器擁有者 | `>addguildadmin`, `>removeguildadmin`, `>guildpermissions` |
| Bot 擁有者 | `>addadmin`, `>removeadmin`, `>getinfo`, `>getserverlist`, `>r6update`, `>update` |

### R6 活動流程

1. 登入網站，開啟 Account，按「Generate link code」。
2. 在 Discord 使用 `>link <code>`；代碼 10 分鐘後失效且只能使用一次。
3. 在網站 Events 建立活動，填入 Discord 伺服器 ID、開始時間及人數上限。
4. Discord 使用 `>events` 查看活動，再用 `>eventjoin <event_id>` 或 `>eventleave <event_id>` 報名。
5. 使用 `>eventteams <event_id>` 依報名順序產生人數平衡的兩隊。

建立活動前必須先連結 Discord 身分；網站與 Bot 會使用同一份 MySQL 報名資料。成員可用 `>roles` 及 `>role <role_id>` 選擇已開放身份組，管理員可在 Admin 的 Announcements 分頁建立排程公告。

## 安全注意事項

- 唔好提交 `discord-part/config.json`、`shared/database/config.json` 或 `website-part/.env`。
- 請使用只擁有本程式所需權限嘅專用 MySQL 帳戶。
- 喺受信任嘅本機網絡以外部署網站時，請使用 HTTPS 同安全嘅 Session Cookie 設定。
- 只好設定你信任嘅代理目標；已授權用戶可以經 `/connect/<slug>/` 存取獲分配嘅連線。

## 依賴套件

Discord Bot 嘅依賴已列喺 `discord-part/requirements.txt`。網站嘅依賴同 lockfile 喺 `website-part/package.json` 同 `website-part/package-lock.json`。

主要執行期套件包括 `discord.py`、`PyMySQL`、`Express`、`express-session`、`express-rate-limit`、`bcryptjs`、`mysql2` 同 `http-proxy-middleware`。

## 授權

本專案僅供個人及社群使用。保留所有權利。

## 貢獻

歡迎提交 Issue 及 Pull Request。除非改動確實需要跨專案，否則請將修改範圍限制喺 `discord-part/`、`website-part/` 或 `shared/` 其中一個目錄。
