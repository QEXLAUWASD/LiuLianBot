# 🎮 LiuLianBot（榴槤 Bot）

使用 [discord.py](https://github.com/Rapptz/discord.py) 開發嘅多功能 Discord 機械人，專為遊戲社群設計，整合《彩虹六號：圍攻》工具、私人語音頻道、伺服器事件記錄及多語言支援。

---

## ✨ 功能特色

### 🎯 彩虹六號：圍攻工具
- **隨機地圖抽選** — 隨機抽出 R6 地圖，附帶 playlist 資訊
- **隨機幹員抽選** — 隨機選擇幹員（進攻方 / 防守方 / 全部）
- **地圖資訊查詢** — 查看指定地圖嘅詳細資料

### 🔊 私人語音頻道
- 用戶可以自創臨時語音頻道
- 完全控制頻道名稱、人數上限同權限
- 自動清理閒置嘅空頻道
- 支援語音頻道擁有權轉移

### 📋 伺服器事件記錄
全面記錄伺服器事件到指定頻道：
- 訊息編輯、刪除、大量刪除
- 語音狀態變更（加入、離開、移動、靜音、拒絕收聽）
- 成員加入、離開、更新、封鎖、解封
- 頻道建立、刪除、更新
- 身份組建立、刪除、更新
- 伺服器更新

### 🎲 抽選系統
- 可設定抽選頻道同自訂模式
- 基於身份組嘅隨機抽選，適合組隊使用

### 🌐 網站儀表板
- 網頁版 R6 抽選介面，用瀏覽器就可以用
- 用戶登入系統（註冊 / 登入）
- 管理面板，可以管理 Bot 同用戶
- SQL 注入防護同 Session 安全機制

### 🔄 自動更新
- 透過 Bot 指令從 GitHub 拉取最新程式碼
- 支援公開同私人 Repo
- 可設定更新後自動重啟 Bot

### 🌐 多語言支援
- **English**（英文）
- **繁體中文**（`zh_TW`）
- 每個伺服器可以獨立設定語言

### 🔐 權限系統
階層式權限模型：
| 級別 | 說明 |
|------|------|
| **Bot 擁有者** | 完整控制權，可使用所有指令 |
| **Bot 管理員** | 跨伺服器管理權限 |
| **伺服器擁有者** | 管理伺服器管理員同伺服器權限 |
| **伺服器管理員** | 設定伺服器特定功能 |

---

## 📁 專案結構

```
LiuLianBot/
├── start.sh                  # Linux 啟動腳本
├── discord-part/
│   ├── main.py               # Bot 主入口
│   ├── config.json           # Bot 設定檔
│   ├── default_config.json   # 預設設定範本
│   ├── requirements.txt      # Python 依賴
│   ├── command/
│   │   ├── commandHandler.py # 指令載入同路由
│   │   ├── language_manager.py
│   │   ├── permission_checker.py
│   │   ├── roller_service.py
│   │   └── commands/
│   │       ├── user/         # 公用指令
│   │       ├── guild_admin/  # 伺服器管理員指令
│   │       ├── guild_owner/  # 伺服器擁有者指令
│   │       └── owner/        # Bot 擁有者指令
│   ├── core/
│   │   ├── bot_client.py     # Bot 客戶端（discord.py 子類別）
│   │   ├── config.py         # 設定載入器
│   │   └── slash_adapter.py  # Slash 指令轉接器
│   ├── features/
│   │   ├── r6_roll/           # R6 地圖同幹員抽選
│   │   ├── private_voice_chat/# 私人語音頻道系統
│   │   ├── server_logger/    # 事件記錄系統
│   │   ├── message_logger/    # 訊息記錄輔助
│   │   └── user_logger/       # 用戶事件記錄輔助
│   ├── locales/
│   │   ├── en.json           # 英文翻譯
│   │   └── zh_TW.json        # 繁體中文翻譯
│   ├── tools/                # 開發工具
│   ├── utils/
│   │   ├── database.py       # MySQL 資料庫連接
│   │   └── logger.py         # 記錄器設定
│   └── updater/
│       └── updater.py        # Git 自動更新模組
├── website-part/
│   ├── server.js             # Express.js 網頁伺服器
│   ├── package.json          # Node.js 依賴
│   ├── db.js                 # 資料庫連接
│   ├── middleware/
│   │   ├── adminAuth.js      # 管理員驗證
│   │   └── security.js       # SQL 注入防護
│   ├── public/
│   │   ├── login.html        # 登入頁面
│   │   ├── index.html        # 儀表板（需登入）
│   │   ├── roller.html       # 網頁版 R6 抽選
│   │   ├── admin.html        # 管理面板（限管理員）
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── app.js
│   │       ├── auth.js
│   │       ├── roller.js
│   │       └── admin.js
│   └── routes/
│       ├── auth.js           # 身份驗證 API
│       ├── roller.js         # 抽選 API
│       └── admin.js          # 管理 API
├── shared/
│   ├── database/
│   │   ├── config.json       # 共用資料庫設定
│   │   └── README.md
│   └── r6/
│       ├── maplist.json      # R6 地圖資料
│       ├── mapsgrap.py       # 地圖資料爬蟲
│       ├── operatorlist.json # R6 幹員資料
│       └── opsgrap.py        # 幹員資料爬蟲
└── logs/                     # 執行記錄
```

---

## 🚀 快速開始

### 環境要求
- **Python 3.8+**
- **MySQL** / **MariaDB** 伺服器
- Discord Bot Token（[Discord 開發者平台](https://discord.com/developers/applications)）

### Linux 安裝

```bash
# 1. Clone 專案
git clone https://github.com/QEXLAUWASD/LiuLianBot.git
cd LiuLianBot

# 2. 設定啟動腳本權限
chmod +x start.sh

# 3. 設定 Bot
cp discord-part/default_config.json discord-part/config.json
nano discord-part/config.json  # 編輯你嘅設定

# 4. 啟動 Bot
./start.sh
```

### 手動安裝

```bash
# 建立虛擬環境
python3 -m venv .venv
source .venv/bin/activate

# 安裝依賴
pip install -r discord-part/requirements.txt

# 啟動 Bot
python discord-part/main.py
```

---

## ⚙️ 設定說明

編輯 `discord-part/config.json`：

```json
{
    "logging_level": "WARNING",
    "prefix": ">",
    "bot_owner": ["你的Discord用戶ID"],
    "bot_admin": ["管理員用戶ID"],
    "activity": {
        "type": "playing",
        "name": "Rainbow Six Siege"
    },
    "token": "你的Bot Token",
    "mysql_config": {
        "host": "localhost",
        "user": "root",
        "password": "你的密碼",
        "database": "discordbot",
        "charset": "utf8mb4"
    },
    "updater": {
        "github_repo": "owner/repo",
        "branch": "master",
        "auto_restart": false
    }
}
```

| 設定項 | 說明 |
|--------|------|
| `logging_level` | 記錄等級：`DEBUG`、`INFO`、`WARNING`、`ERROR` |
| `prefix` | 指令前綴（預設：`>`） |
| `bot_owner` | Bot 擁有者嘅 Discord 用戶 ID 陣列 |
| `bot_admin` | Bot 管理員嘅 Discord 用戶 ID 陣列 |
| `activity` | Bot 顯示嘅活動狀態 |
| `token` | 你嘅 Discord Bot Token |
| `mysql_config` | MySQL 資料庫連線設定 |
| `updater.github_repo` | 自動更新用嘅 GitHub Repo（`owner/repo`） |
| `updater.branch` | 要追蹤嘅 Git 分支（預設：`master`） |
| `updater.auto_restart` | 更新後自動重啟 Bot |

---

## 📝 指令列表

### 用戶指令（前綴：`>`）
| 指令 | 說明 |
|------|------|
| `>help` | 顯示所有可用指令 |
| `>help <指令>` | 顯示特定指令嘅說明 |
| `>getlang` | 查閱目前伺服器語言 |
| `>r6maproll` | 隨機抽選 R6 地圖 |
| `>r6opsroll` | 隨機抽選 R6 幹員 |
| `>getr6mapinfo <地圖>` | 查閱指定地圖資訊 |
| `>roller` | 從已設定嘅抽選頻道抽選 |
| `>mypermissions` | 檢查你嘅權限等級 |
| `>listguildadmins` | 列出伺服器管理員 |
| `>transfervoice <@用戶>` | 轉移語音頻道擁有權 |

### 伺服器管理員指令
| 指令 | 說明 |
|------|------|
| `>setlang <en/zh_TW>` | 設定伺服器語言 |
| `>setlogchannel <#頻道>` | 設定記錄頻道 |
| `>setprivatevoice <#頻道>` | 設定私人語音建立頻道 |
| `>setupvoice` | 設定語音系統 |
| `>removeprivatevoice` | 移除私人語音頻道設定 |
| `>setrollerchannel <#頻道>` | 設定抽選頻道 |
| `>setrollermode <模式>` | 設定抽選模式 |

### 伺服器擁有者指令
| 指令 | 說明 |
|------|------|
| `>addguildadmin <@用戶>` | 新增伺服器管理員 |
| `>removeguildadmin <@用戶>` | 移除伺服器管理員 |
| `>guildpermissions` | 查看伺服器權限設定 |

### Bot 擁有者指令
| 指令 | 說明 |
|------|------|
| `>addAdmin <@用戶>` | 新增 Bot 管理員 |
| `>removeAdmin <@用戶>` | 移除 Bot 管理員 |
| `>getInfo` | 獲取 Bot 執行資訊 |
| `>getServerList` | 列出 Bot 所在嘅所有伺服器 |
| `>r6update` | 更新 R6 地圖同幹員資料 |
| `>update` | 從 GitHub 拉取最新程式碼 |

---

## 🌐 網站設定

網站部分提供網頁版 R6 抽選介面同用戶管理功能。

```bash
cd website-part

# 安裝依賴
npm install

# 設定環境變數
cp .env.example .env
# 編輯 .env 填入你嘅資料庫同 Session 設定

# 啟動伺服器
npm run start
```

網站預設喺 `http://localhost:3000` 執行。

---

## 🛠️ 依賴套件

| 套件 | 版本 | 用途 |
|------|------|------|
| `discord.py` | 2.3.0 | Discord API 封裝 |
| `pymysql` | 1.1.2 | MySQL 資料庫驅動 |
| `colorama` | 0.4.6 | 終端機彩色輸出 |
| `psutil` | ≥5.9.0 | 系統資源監控 |
| `cryptography` | 46.0.3 | 加密操作 |
| `requests` | ≥2.31.0 | HTTP 請求（R6 資料爬蟲） |
| `beautifulsoup4` | ≥4.12.0 | HTML 解析（R6 資料爬蟲） |

### 網站依賴 (Node.js)

| 套件 | 版本 | 用途 |
|------|------|------|
| `express` | ^4.18.2 | 網頁伺服器框架 |
| `express-session` | ^1.17.3 | Session 管理 |
| `bcryptjs` | ^2.4.3 | 密碼雜湊 |
| `dotenv` | ^16.3.1 | 環境變數 |
| `mysql2` | ^3.9.0 | MySQL 資料庫驅動 |

---

## 📄 授權

本專案僅供個人 / 社群使用。保留所有權利。

---

## 🤝 貢獻

歡迎提出 Issues、功能請求同 Pull Requests！
