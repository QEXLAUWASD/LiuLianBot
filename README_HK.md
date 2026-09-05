# LiuLianBot（榴槤 Bot）

LiuLianBot 係一個畀遊戲社群使用嘅 Discord 機械人同配套網站。提供《彩虹六號：圍攻》抽選、臨時私人語音頻道、伺服器事件記錄、可設定抽選系統、活動，以及帳戶同連線管理網站。

## 功能

程式入口、指令處理同 Bot／網站之間嘅資料流程，見[功能運作導覽（繁體中文）](docs/FEATURE_WALKTHROUGH.zh-TW.md)。

### Discord 機械人

- 《彩虹六號：圍攻》地圖、幹員同地圖資訊指令
- 可設定抽選頻道，支援根據身份組隨機揀選
- 臨時私人語音頻道，支援轉移擁有權同自動清理空頻道
- 記錄訊息、語音狀態、成員、頻道、身份組同伺服器事件；被其他使用者或管理員強制移動語音頻道時會記錄操作者；如部分 discord.py 版本忽略 `member_move` filter，Bot 會再掃描最近 Audit Log 作備援。
- 每個伺服器可獨立揀英文或繁體中文（`zh_TW`）
- Bot 擁有者、Bot 管理員、伺服器擁有者、伺服器管理員同一般用戶嘅分層權限
- 前綴指令同自動註冊嘅 slash 指令共用同一套處理器
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
- 記錄網站資料儲存同意；SSH/RDP 遠端功能可限制畀指定用戶群組
- 提供 SSH 終端機及 RDP 連線檔，設定可選擇只保存喺瀏覽器或以 AES-256-GCM 加密保存喺伺服器
- 提供使用 Puppeteer 同 Chrome DevTools Protocol screencast 嘅內建 Chromium 工作區頁面
- Interim VLESS Tunnel 頁面：將短期 VLESS 連線加入現有 VLESS 位址或 Clash / Mihomo YAML
- Admin 提供頁面可見度設定，可按未登入訪客、全部登入用戶、指定網站群組或指定用戶控制顯示

## 專案結構

```
LiuLianBot/
|-- discord-part/                 # Python Discord 機械人
|   |-- main.py                   # Bot 主入口
|   |-- default_config.json       # Bot 設定範本
|   |-- commands/                 # 前綴指令處理器及共用使用者解析
|   |-- core/                     # Bot 生命週期、設定與 Slash adapter
|   |-- features/                 # Discord 事件功能
|   |-- locales/                  # 英文及繁體中文字串
|   |-- tests/                    # Python 測試
|   |-- updater/                  # Git 更新功能
|   `-- utils/                    # 資料庫及日誌工具
|-- website-part/                 # Node.js / Express 網站
|   |-- public/                   # HTML、CSS 同瀏覽器端 JavaScript（包括 chromium.html）
|   |-- src/                      # App、路由、中介層、資料庫 repository 及服務
|   `-- test/                     # Node.js 測試
|-- docs/
|   `-- API.md                    # 網站 HTTP、WebSocket 同 Socket.IO API 參考
|-- shared/
|   |-- database/                 # 共用 MySQL 設定與範本
|   `-- r6/                       # R6 資料及爬蟲
|-- .github/workflows/            # CI 設定
|-- start.sh                      # Linux Bot 管理腳本
|-- PRIVACY_POLICY.md
`-- TERMS_OF_SERVICE.md
```

## 架構及重構界線

Discord 機械人同網站維持獨立 runtime，只共用 MySQL schema 同資料契約。
`discord-part/commands/user_target.py` 集中處理管理指令嘅 mention／使用者 ID
解析：無效 ID 交返畀指令做本地化驗證，而預期嘅 Discord 查詢失敗會退回數字
ID，唔會吞掉取消操作或者無關例外。

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

### 4. 安裝及執行網站

從範本建立網站環境檔。喺非本機開發環境，務必設定夠長而且唯一嘅 `SESSION_SECRET`。

```bash
cd website-part
cp .env.example .env
npm ci
npm start
```

本機開發時，`npm run dev` 會使用同一個伺服器入口。網站預設監聽
`127.0.0.1:3000`。

Linux 生產環境可以用 PM2 管理：

```bash
cd website-part
./start.sh init
./start.sh start
```

修改生產依賴或 PM2 設定後，需要再次執行 `./start.sh init`。正式部署時，請
喺網站前面配置反向代理並提供 HTTPS。
MySQL Session 背景清理遇到暫時性錯誤時只會記錄錯誤，唔會停用新登入
Session。部署 Session Store 修正後，請執行 `./start.sh restart` 重啟 PM2 程式。

如果更新咗網站依賴（例如 Interim VLESS Tunnel 新增嘅 `js-yaml`），要先喺
實際 PM2 使用嘅 website 目錄重新安裝 production dependencies，再重啟：

```bash
cd /opt/website/LiuLianBot/website-part
npm ci --omit=dev
npm ls js-yaml socket.io @electerm/rdpjs --depth=0
pm2 restart liulianb --update-env
```

`npm ls` 應該列出以上三個套件；如果 `src/services/vless_tunnel.js` 出現
`MODULE_NOT_FOUND`，代表部署主機未完成依賴安裝，或者 PM2 指向另一個 website
目錄。

### 用 Docker CLI 執行網站

以下映像只包含 `website-part/` 同其 production Node.js 依賴，唔會建立或啟動
`discord-part/`。共用資料庫設定會喺容器啟動時用唯讀掛載提供。

先依照上方步驟建立 `website-part/.env` 同
`shared/database/config.json`，並喺 `.env` 設定夠長而且唯一嘅
`SESSION_SECRET`。喺 repository 根目錄建立映像：

```bash
docker build --file website-part/Dockerfile --tag liulianbot-website:latest .
```

執行網站容器。`BIND_IP=0.0.0.0` 會令 Docker port forwarding 可以連到網站；
正式環境請喺前面配置 HTTPS 反向代理。

```bash
docker run --detach --name liulianbot-website \
  --restart unless-stopped \
  --publish 3000:3000 \
  --env-file website-part/.env \
  --env BIND_IP=0.0.0.0 \
  --volume "$(pwd)/shared/database/config.json:/app/shared/database/config.json:ro" \
  liulianbot-website:latest
```

Windows PowerShell 請用 `${PWD}` 掛載資料庫設定：

```powershell
docker run --detach --name liulianbot-website `
  --restart unless-stopped `
  --publish 3000:3000 `
  --env-file website-part/.env `
  --env BIND_IP=0.0.0.0 `
  --volume "${PWD}/shared/database/config.json:/app/shared/database/config.json:ro" `
  liulianbot-website:latest
```

用 `docker logs --follow liulianbot-website` 查看容器日誌。網站程式碼或依賴更新後，
重新建立映像並取代容器：

```bash
docker build --file website-part/Dockerfile --tag liulianbot-website:latest .
docker rm --force liulianbot-website
# 再執行上面嘅 docker run 指令。
```

### 網站環境變數

網站由 `shared/database/config.json` 讀取 MySQL 設定，其餘運行設定由
`website-part/.env` 讀取。

| 變數 | 預設值 | 用途 |
|---|---|---|
| `NODE_ENV` | `development` | 生產環境設為 `production`；此模式要求 `SESSION_SECRET` 並啟用安全 Cookie。 |
| `PORT` | `3000` | HTTP 監聽連接埠。 |
| `BIND_IP` | `127.0.0.1` | 監聽地址；配合本機反向代理時保留預設值。 |
| `SESSION_COOKIE_NAME` | `connect.sid` | Session Cookie 名稱。 |
| `SESSION_SECRET` | 只供開發 fallback | 用來簽署 Session 嘅長隨機密碼；生產環境必須設定。 |
| `TERMS_OF_SERVICE_REQUIRED` | `true` | 只有主機管理者毋須強制明確同意服務條款及資料儲存時先設為 `false`。 |
| `PROXY_ALLOW_SELF_SIGNED` | `false` | 只有上游網站刻意使用自簽憑證時先設為 `true`。 |
| `REMOTE_ALLOWED_GROUPS` | `admin` | 可使用 SSH/RDP 頁面及 API 嘅網站用戶群組。 |
| `REMOTE_SSH_ENABLED` | `true` | 設為 `false` 即對所有用戶停用 SSH，包括管理員。 |
| `REMOTE_RDP_ENABLED` | `true` | 設為 `false` 即對所有用戶停用 RDP，包括管理員。 |
| `SSH_ALLOWED_HOSTS` | 空白 | 可選嘅 SSH 主機名稱、IPv4 地址或 IPv4 CIDR 網段清單；空白代表容許所有可到達主機。 |
| `REMOTE_CREDENTIAL_ENCRYPTION_KEY` | 空白 | 用於伺服器端加密保存 SSH/RDP 設定嘅 Base64 32-byte AES-256-GCM 金鑰。 |
| `CHROME_EXECUTABLE_PATH` | 空白 | 如果 Chrome/Chromium 唔喺 `PATH`，請填入執行檔路徑。 |
| `CHROME_CDP_URL` | 空白 | 可選嘅遠端 Chrome DevTools endpoint，例如 `http://192.168.1.10:9222`；設定後網站會連去遠端 Chrome，而唔會喺本機啟動。 |
| `CHROMIUM_SESSION_TIMEOUT_MS` | `1800000` | 每個 Chromium WebSocket 工作階段最長存活時間，單位係毫秒。 |
| `VLESS_TUNNEL_ADDRESS` | 空白 | Interim VLESS listener 對用戶端公開嘅主機名稱或地址；留空會停用產生功能。 |
| `VLESS_TUNNEL_PORT` | `443` | Interim VLESS listener 連接埠。 |
| `VLESS_TUNNEL_UUID` | 空白 | Xray / V2Ray listener 使用嘅 UUID。 |
| `VLESS_TUNNEL_NETWORK` | `tcp` | 傳輸方式：`tcp`、`ws` 或 `grpc`。 |
| `VLESS_TUNNEL_SECURITY` | `tls` | 安全方式：`tls`、`reality` 或 `none`。 |
| `VLESS_TUNNEL_REALITY_PUBLIC_KEY` | 空白 | Reality public key；使用 `reality` 時必須設定。 |
| `VLESS_TUNNEL_REALITY_SHORT_ID` | 空白 | Reality short ID；使用 `reality` 時必須設定。 |
| `VLESS_TUNNEL_CLIENT_FINGERPRINT` | `chrome` | Reality client fingerprint。 |
| `VLESS_TUNNEL_SNI` | `VLESS_TUNNEL_ADDRESS` | TLS SNI；WebSocket / gRPC 亦可用作 server name。 |
| `VLESS_TUNNEL_PATH` | `/` | WebSocket path 或 gRPC service name。 |
| `VLESS_TUNNEL_HOST` | 空白 | WebSocket Host header（選填）。 |
| `VLESS_TUNNEL_FLOW` | 空白 | VLESS flow（選填）。 |
| `VLESS_TUNNEL_REMARK` | `LiuLianBot interim internal tunnel` | 輸出設定中顯示嘅節點名稱。 |
| `VLESS_TUNNEL_INTERNAL_TARGET` | `web server internal network` | 頁面顯示嘅路由目標說明；實際路由由 VLESS listener 設定。 |
| `VLESS_TUNNEL_TTL_SECONDS` | `3600` | 輸出結果標示嘅有效時間，範圍 60 秒至 24 小時。 |
| `VLESS_TUNNEL_ALLOW_INSECURE` | `false` | 是否在輸出中略過 TLS 憑證驗證；除非使用受信任內網憑證，否則應保持 `false`。 |

### 遠端用戶端設定

遠端頁面只開放畀 `REMOTE_ALLOWED_GROUPS` 內嘅網站用戶群組（預設係 `admin`）。請設定可用群組；喺非受信任網絡，亦應限制網站伺服器可連去嘅 SSH 主機：

```env
REMOTE_ALLOWED_GROUPS=admin,server-operator
SSH_ALLOWED_HOSTS=server.example.com,192.168.1.0/24
```

如要啟用伺服器端加密保存 SSH 主機資訊／私密金鑰及 RDP 連線資訊，請產生並安全保存一個 32-byte 金鑰。SSH 密碼絕不會被保存。

```bash
openssl rand -base64 32
```

將輸出填入 `website-part/.env`：

```env
REMOTE_CREDENTIAL_ENCRYPTION_KEY=<generated-base64-key>
```

加密設定仍存在時，唔好遺失或更換此金鑰，否則無法解密舊資料。未設定金鑰時，用戶仍可保存到瀏覽器，但伺服器端保存會被停用。

Windows PowerShell：

```powershell
Set-Location website-part
Copy-Item .env.example .env
npm ci
npm start
```

網站預設喺 `http://127.0.0.1:3000` 運行。執行自動化測試：

```bash
npm test
```

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

### 伺服器管理頁及分類記錄

先在網站 **Account** 產生代碼並以 `>link <code>` 連結 Discord 身分，之後開啟 **Discord Manager**。只有已連結嘅伺服器擁有者、已設定嘅伺服器管理員或 Bot 管理員先會見到相應伺服器。頁面可以設定 Bot 語言、全域 `all` 記錄頻道同各個分類嘅覆寫頻道。

伺服器管理員亦可以喺 Discord 使用：
`/setlogchannel <all|useraction|voiceaction|groupaction|messageaction|channelaction|roleaction> <channel>`。
`all` 係所有事件嘅預設頻道；有設定分類頻道時，該分類會優先使用覆寫頻道。

### R6 活動流程

1. 登入網站，開啟 Account，按「Generate link code」。
2. 在 Discord 使用 `>link <code>`；代碼 10 分鐘後失效且只能使用一次。
3. 在網站 Events 建立活動，填入 Discord 伺服器 ID、開始時間及人數上限。
4. Discord 使用 `>events` 查看活動，再用 `>eventjoin <event_id>` 或 `>eventleave <event_id>` 報名。
5. 使用 `>eventteams <event_id>` 依報名順序產生人數平衡的兩隊。

建立活動前必須先連結 Discord 身分；網站與 Bot 會使用同一份 MySQL 報名資料。成員可用 `>roles` 及 `>role <role_id>` 選擇已開放身份組，管理員可在 Admin 的 Announcements 分頁建立排程公告。

## 網站頁面及路由

公開頁面包括 `login.html`、`terms.html`、`roller.html` 同 `404.html`。登入後可
使用 `index.html`、`account.html`、`events.html`、`remote.html` 同
`chromium.html`、`vless-tunnel.html` 同 `guild-manager.html`；管理員另外可以使用 `admin.html`。

網站喺 `/api` 提供登入、帳戶及 Discord 連結、R6 抽選、活動、網站連線、管理員、
遠端設定、VLESS tunnel 合併及 RDP 檔案 API。已授權嘅 HTTP/WebSocket 網站連線位於
`/connect/<slug>/`；SSH 使用 `/api/ssh` WebSocket endpoint。

完整 endpoint、請求欄位、權限、錯誤回應同 WebSocket/Socket.IO 訊息協定，請參考
[`docs/API.md`](docs/API.md)。

### 頁面可見度

管理員可以開啟 Admin > Page Visibility，控制網站子頁面會唔會出現喺導覽列及儀表板連結。每個頁面可以設定畀未登入訪客、全部登入用戶、指定網站群組或指定用戶顯示。頁面路由亦會檢查設定；Remote 等功能原有嘅專屬權限要求仍然有效。

### Chromium 工作區

Chromium 頁面使用 Puppeteer 同 Chrome DevTools Protocol（CDP）screencast。網站伺服器會啟動 headless Chrome/Chromium，經已驗證嘅 WebSocket 傳送 JPEG 畫面，再經 CDP 將用戶輸入事件傳返瀏覽器。請喺伺服器安裝 Chrome 或 Chromium；如果執行檔唔喺 `PATH`，就設定 `CHROME_EXECUTABLE_PATH`。OpenWrt 如果 feed 入面冇 Chromium，可以設定 `CHROME_CDP_URL` 連去另一部機嘅 Chrome DevTools endpoint。每個登入用戶會有自己嘅瀏覽器頁面，WebSocket 中斷或者逾時後會自動關閉。管理員仍然可以喺 Admin > Page Visibility 設定邊啲用戶或群組可以見到 Chromium 頁面。

### Interim VLESS Tunnel

管理員先要喺 `website-part/.env` 設定 `VLESS_TUNNEL_ADDRESS`、
`VLESS_TUNNEL_UUID` 及其他 listener 參數，並在該地址運行 Xray / V2Ray
VLESS listener，將流量路由到 `VLESS_TUNNEL_INTERNAL_TARGET` 所代表嘅內部網絡。
網站本身只負責產生用戶端設定，不會代替 Xray / V2Ray 運行協定或自動開啟
防火牆。登入用戶可以在 **VLESS Tunnel** 貼上原有 `vless://` 位址或 Clash /
Mihomo YAML；產生後會保留原有節點並加入 interim 節點，結果只顯示在畫面上。
如使用 Reality，將 `VLESS_TUNNEL_SECURITY` 設為 `reality`，再設定
`VLESS_TUNNEL_REALITY_PUBLIC_KEY`、`VLESS_TUNNEL_REALITY_SHORT_ID`，
並可選擇設定 `VLESS_TUNNEL_CLIENT_FINGERPRINT=chrome`。VLESS URI 會使用
`pbk`、`sid`、`fp` 參數；Clash / Mihomo 輸出會使用 `reality-opts` 同
`client-fingerprint`。原有設定只會以瀏覽器 `localStorage` 保存，唔會寫入網站資料庫。輸出標示嘅 TTL
係設定有效期限提示；如要在到期後真正拒絕連線，Xray / V2Ray listener 或外部
provisioner 必須同步執行憑證／UUID 到期控制。管理員可以使用 Page Visibility
限制頁面可見範圍。

## 開發檢查

安裝開發依賴後，可以執行 CI 使用嘅相同檢查：

```bash
# Discord Bot
python -m pip install -r discord-part/requirements-dev.txt
python -m pytest -q
python -m ruff check discord-part shared
python -m compileall -q discord-part shared

# 網站
cd website-part
npm ci
npm run check
```

`npm run check` 會解析瀏覽器 JavaScript 並執行完整 Node.js 測試。資料庫相關
測試需要連到測試 MySQL 資料庫，但唔會啟動正式網站伺服器。

## 安全注意事項

- 唔好提交 `discord-part/config.json`、`shared/database/config.json` 或 `website-part/.env`。
- 請使用只擁有本程式所需權限嘅專用 MySQL 帳戶。
- 喺受信任嘅本機網絡以外部署網站時，請使用 HTTPS 同安全嘅 Session Cookie 設定。
- 只好設定你信任嘅代理目標；已授權用戶可以經 `/connect/<slug>/` 存取獲分配嘅連線。
- 生產環境應設定 `SSH_ALLOWED_HOSTS`。支援主機名稱、IPv4 位址及例如 `192.168.1.0/24` 嘅 IPv4 CIDR 網段；留空代表容許連去網站伺服器可到達嘅任何主機。
- 可設定 `REMOTE_SSH_ENABLED=false` 或 `REMOTE_RDP_ENABLED=false`，全域停用相應遠端功能，包括管理員。
- 遠端功能同時要求用戶已接受網站條款，並屬於 `REMOTE_ALLOWED_GROUPS` 其中一個群組。
- 瀏覽器端遠端設定會保存喺 `localStorage`；共用或不受信任裝置唔應使用瀏覽器儲存。
- 將 `REMOTE_CREDENTIAL_ENCRYPTION_KEY` 保留喺原始碼管理以外並安全備份；佢保護已保存嘅 SSH 私密金鑰及 RDP 連線資訊。

## 依賴套件

Discord Bot 嘅依賴已列喺 `discord-part/requirements.txt`。網站嘅依賴同 lockfile 喺 `website-part/package.json` 同 `website-part/package-lock.json`。

主要執行期套件包括 `discord.py`、`PyMySQL`、`Express`、`express-session`、`express-rate-limit`、`bcryptjs`、`mysql2`、`http-proxy-middleware`、`ssh2` 同 `ws`。

## 授權

本專案僅供個人及社群使用。保留所有權利。

## 貢獻

歡迎提交 Issue 及 Pull Request。除非改動確實需要跨專案，否則請將修改範圍限制喺 `discord-part/`、`website-part/` 或 `shared/` 其中一個目錄。

## RDP 客戶端重建

瀏覽器 RDP 改用獨立連線狀態、畫面解碼同輸入模組；已移除舊
`webrdp.js`，保留 RLE 解碼器同來源聲明。點選桌面先會將鍵盤輸入
送去遠端；切換去表單或其他視窗會釋放按住嘅鍵。縮放畫面會同步
換算滑鼠座標，原始大小模式只改顯示比例。

取消、連線錯誤、逾時同網站關機會清理 RDP socket。伺服器連線期限
為 30 秒，瀏覽器整體期限為 35 秒。斷線後需手動重連並重新輸入密碼；
密碼送出後會清空，唔會儲存喺設定內。

喺 `website-part/` 執行 `npm run test:rdp-browser`，可用本機模擬伺服器
測試畫面、輸入同重連。若未能自動搵到瀏覽器，設定 `RDP_BROWSER_PATH`
指向 Chrome／Edge／Chromium。此測試唔會連真實 RDP 主機；Windows
登入同實際桌面仍需喺部署環境驗證。
