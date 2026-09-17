# 完整更新紀錄

## 未提交更新（基準：`e2794df`）

- 版面改為參考的控制台式框架：`App.jsx` 以 `.app-shell`（grid）包住左側導覽列與 `.app-main`（頂列＋頁面內容），已登入頁面全部套用；配色沿用原本品牌藍／青色，未改動色票。
- `frontend/src/components/NavBar.jsx` 由頂部橫向導覽改寫為側邊欄：品牌、`Main` 連結（Home／R6 Roller／Events／Files／Account），再來是可收合的 `Workspaces`（Remote／Chromium／VLESS）、`Connected websites`（`/api/connections`，首次展開才載入）與 `Administration`（Discord servers／Admin panel），底部固定帳號、登出與收合按鈕。
- 側邊欄支援寬螢幕圖示列收合（`data-nav-collapsed`，收合時圖示列仍可點擊，展開區塊會自動還原寬度）；≤1080px 改為覆蓋式抽屜，由頂列 ☰ 開啟，可用背景遮罩或 `Esc` 關閉。
- 新增頂列（`.topbar`）：顯示 `App.jsx` 的 `PAGE_TITLES` 對應頁面名稱，各頁不需重複實作標題列。
- 儀表板（`frontend/src/pages/DashboardPage.jsx`）重做：頁面標題＋主要動作、四張 KPI 卡（即將到來活動、我的報名、已連線網站、可用工具）、雙欄「Priority」事件清單與「Tools」工具清單，以及全寬面板（搜尋／狀態／排序篩選＋事件表格＋分頁）。
- 儀表板改由 `/api/events`（活動與報名狀態）及 `/api/connections`（已連線網站數）取得真實資料；活動狀態分為 Joined／Signup open／Full，支援關鍵字搜尋、狀態篩選、依開始時間或報名人數排序、每頁 5 筆分頁，載入中與無資料皆有空狀態。
- 共用樣式新增 token `--sidebar-width`、`--sidebar-rail`、`--topbar-height`，以及 `.app-shell`／`.sidebar`／`.topbar`／`.stat-card`／`.split-grid`／`.list-row`／`.tool-row`／`.filter-bar`／`.data-table`／`.pager` 等元件樣式；移除已不使用的 `.navbar-inner`、`.nav-toggle`、`.dashboard-hero`、`.feature-cards` 等規則。
- 修正 `.main-content` 在窄螢幕會被內部表格撐寬的問題（改為 `width: 100%` 搭配 `max-width`），14 個頁面在 390／768／1024／1440px 皆無水平溢出。
- `frontend/*.html` 樣式版本參數更新為 `?v=20260917-ui3`；`test/frontend/app_shell.test.mjs` 改為驗證新框架（側邊欄、頂列、KPI 卡、工具清單）並新增表格篩選／排序／分頁測試。
- 驗證：`npm run check`（語法檢查、Vite 建置、252 項測試）全數通過；另以本機 Chromium 對儀表板（390／1024／1440px、收合圖示列、抽屜）及各頁截圖比對。

### 部署驗證（Router）

- 已將 `74f229e` 拉進 `/opt/website/LiuLianBot`；`website-part/start.sh` 的本機權限修改（100755）保留。
- 已重啟 PM2 `liulianbot-website`（`127.0.0.1:30011`），程序回復 online，log 只有一次正常關閉／啟動且無錯誤。
- `/login.html`、`/share.html`、`/css/style.css` 回應 200；`/index.html`、`/files.html` 未登入時仍 302 導向登入頁。
- 站上頁面已引用 `style.css?v=20260917-ui3`，新的 `/assets/main-D7qD83zy.js` 回應 200、舊 bundle 已不存在；部署後的 `style.css`（`a8281c38…`）與 bundle（`554ef974…`）以 SHA-256 比對與版控內容一致，站上 CSS 亦已包含 `app-shell`／`navbar.sidebar`／`stat-card`／`data-table` 等新樣式。
- 透過 SSH 通道實際開啟線上登入頁截圖確認部署版本正常；需要登入的儀表板與側邊欄因無帳密未在站上開啟，但 bundle 與 CSS 與本機已逐一截圖驗證的版本逐位元相同。

## 已推送：UI 設計系統重做（`6f6e233` → `e2794df`）

- 重做 website-part 前端 UI：以單一設計系統取代舊紫色主題與 Remote／VLESS 頁各自為政的配色，統一使用品牌藍 `#1c6ba0`（同時是 PWA theme color）搭配青色 `#66d9c5` 作為次要強調色。
- `frontend/static/css/style.css` 改寫為 token 化設計系統：深藍色階表面、`--radius`／`--shadow`／`--ring` 等形狀與層次變數、一致的表單、按鈕（primary／outline／danger／roll）、tabs、表格、badge、modal、toast、empty state 與 focus ring。
- 導覽列重做為 sticky 玻璃質感頂欄：品牌標記、主要連結群組、`Workspaces ▾`（Remote／Chromium／VLESS）、`Websites ▾`（已連線網站）、`Manage ▾`（Discord servers／Admin）、使用者膠囊與登出；≤1080px 改為 `Menu` 收合抽屜，並新增 skip link 與 `#main-content` 頁面錨點。
- 導覽分組後，`page-visibility` 與 `remoteAvailable` 過濾仍套用於選單內項目；`/api/connections` 仍於首次展開 `Websites` 時載入一次。
- Dashboard 改為 hero（問候、說明與主要動作按鈕）加上工具卡片格；卡片加上 icon tile、hover 位移與箭頭提示。
- 登入頁改為左右版面：左側品牌說明、右側登入／註冊卡片（tab 結構、`role="alert"` 錯誤訊息與所有 id 維持不變）。
- Remote／WebRDP、SSH、Chromium、VLESS 與 FnOS 檔案頁改用同一組 token 與元件樣式；Chromium 網址列與檔案頁輸入框改為深色 inset 樣式。
- `frontend/static/css/files.css` 以共用 token 重寫（檔案列表、分享面板、breadcrumbs、上傳欄位），不再使用獨立的灰藍色硬編碼。
- `frontend/*.html` 的樣式版本參數更新為 `?v=20260917-ui2`，避免部署後瀏覽器沿用舊 CSS。
- 重新建置 `website-part/public` 產物，並更新 `test/frontend/nav.test.mjs`：改為驗證分組選單（Workspaces／Manage）、`page-visibility` 於選單內仍生效，以及一次僅開啟一個選單。
- 更新 README／README_HK（新增設計系統段落，並修正 Discord 伺服器管理頁的新導覽路徑）與 `.gitignore`（涵蓋 symlink 形式嘅 `node_modules` 及瀏覽器 crash dump）。
- 驗證：`npm run check`（JSX／Node 語法檢查、Vite 建置、251 項測試）全數通過；另以本機 Chromium 對 13 個頁面與 390／1024／1280／1440 寬度截圖比對版面（截圖僅為本機驗證，未納入版本庫）。
- 尚未在 Router 部署環境重新驗證外觀；部署後需以實際瀏覽器確認導覽抽屜與各工作區頁面。

### 部署驗證（Router）

- 已將 `6c75c63`、`049516e` 拉進 `/opt/website/LiuLianBot`；Router 上 `website-part/start.sh` 為僅權限差異（100755）的本機修改，已保留。
- 已重啟 PM2 `liulianbot-website`（`127.0.0.1:30011`），程序回復 online，log 只有一次正常關閉／啟動且無錯誤。
- `/login.html`、`/share.html`、`/terms.html`、`/404.html` 回應 200；`/index.html`、`/files.html`、`/admin.html` 未登入時仍 302 導向登入頁。
- 站上頁面已引用 `style.css?v=20260917-ui2`，新的 `/assets/main-CY3Dw-ot.js` 回應 200、舊 bundle 已不存在；部署後的 `style.css` 與 bundle 以 SHA-256 比對與版控內容一致。
- 透過 SSH 通道以 1280px 與 390px 實際開啟線上登入頁，確認新版版面在部署版本正常呈現。

## 已推送：FnOS 檔案管理與分享（`d17e122` → `6f6e233`）

- 新增 Router 網站 FnOS 檔案管理與分享功能，限定存取 `/vol*/1000`。
- 依 `31efd56` 的 React 架構移植前端：`frontend/files.html` 與 `frontend/share.html` 掛載共用 bundle，邏輯在 `frontend/src/pages/FilesPage.jsx`、`SharePage.jsx`，API 包裝在 `frontend/src/lib/filesApi.mjs`，樣式在 `frontend/static/css/files.css`。
- 支援目錄導覽、目前目錄搜尋、串流下載、上傳、新增資料夾、同磁碟重新命名及刪除檔案／空目錄；上傳上限 1 GiB 且不覆蓋同名檔案。
- 綁定 LiuLian 帳號 ID 管理讀取、寫入及分享授權，其他帳號可提出存取申請。
- 新增免登入分享碼，支援 1 至 168 小時期限、子目錄瀏覽、撤銷及 SHA-256 雜湊儲存。
- 新增 migration `018` 建立檔案權限及分享資料表；用戶 ID 相關欄位依 migration `017` 使用 `VARCHAR(64)`，避免 UUID 寫入失敗。
- 新增 migration `019` 修正版本衝突：舊版未發佈的檔案 migration 曾佔用 `017`，令部分資料庫略過 UUID 欄位加寬，`019` 會重新逐欄檢查並套用。
- 新增 SFTP 主機金鑰驗證、路徑與權限測試，以及前端 `files_page`／`share_page` 測試與無障礙頁面條目測試。
- 已重建 `website-part/public` 建置產物，並更新 README／README_HK、`docs/API.md`、`docs/file-browser.md`。
- 舊版前端曾在 Router 以 FnOS `liulian` 帳號完成七個磁碟的實機讀寫與分享驗證；改版後需在部署環境重新驗證。連線憑證僅保留於私有設定。
- 已推送並部署至 Router（`/opt/website/LiuLianBot`，PM2 `liulianbot-website`，`127.0.0.1:30011`）：`start.sh` 執行權限保留，服務正常啟動；`/login.html`、`/share.html` 回應 200，`/files.html` 未登入時 302 導向登入頁，檔案 API 未登入回應 401、無效分享碼回應 404。
- 部署後實測：migration `017`～`019` 均已記錄，`website_users.id` 及所有參照欄位為 `VARCHAR(64)`，11 個指向 `website_users` 的外鍵完整還原；以 36 字元 UUID 於交易內插入用戶成功並已 rollback（無殘留資料），SFTP 可列出 `vol1`～`vol7` 及 `vol1` 內容。

> 涵蓋範圍：`5f342de`（2025-12-02，第一個 commit）至 `bf2875a`（2026-09-04，最新 commit）。共 193 個 commit。以下依 commit 時間排序；合併提交與小型修復亦完整保留。

## 版本總覽

- **Discord Bot 基礎與核心功能**：建立 Discord Bot、指令／本地化、MySQL 私人語音頻道、R6 地圖與幹員抽選、伺服器事件記錄。
- **架構重整與網站管理台**：拆分 Discord／Website runtime，建立共用資料層、帳號／RBAC、連線管理、代理與行動版頁面。
- **可靠性與安全性**：補強資料庫 migration、非同步與更新流程、session／認證、輸入驗證、錯誤資訊遮罩、遠端連線 allowlist 與 Chromium 安全邊界。
- **活動、遠端工作區與 VLESS**：加入社群活動與排程公告、SSH／RDP／WebRDP、Chromium CDP 工作區，以及 VLESS Reality 設定輸出。
- **品質與維運**：建立 Python／Website 測試基線、CI、Docker／PM2 啟動方式、API／部署／migration 文件與可及性改善。

## 完整 Commit Ledger

### 2025-12-02

- `5f342de` DiscordBotFirstCommit
- `e6eb94c` Hot Fix: Correct Help Command Descriptions
- `7cd7fe9` hotfix: correct typo in localization files
- `c258d9a` Hot fix commit message

### 2025-12-04

- `a1c9701` Make private voice chat use MySQL for data storage and update requirements.txt accordingly.
- `549f875` Fix
- `69032c9` database fix
- `7ac7641` fix
- `91e9e47` fix database not using
- `25ba1bf` Database
- `d8e44b2` .
- `34e9ff0` .
- `3427560` .
- `7bf1fac` .
- `d7da891` .
- `fabdb51` .
- `d6d5de9` .

### 2025-12-20

- `c683fc8` add a few fuctions for logging voice channel events and messsage edits/deletions

### 2025-12-21

- `f037fc8` add random rainbow six operator and map roller feature
- `8cabca4` fix ops role parsing
- `4847d5b` Interactive update

### 2025-12-23

- `59c8d0a` fix ops roll weapon accessories translation keys
- `20e6c30` hotfix for roll accessory names and remove accessory roll chance
- `254957d` hotfix

### 2025-12-28

- `3d97118` fix random operator roll displaying map info and add missing response handling. Added handling for interaction responses when sending the roll selection view.

### 2026-01-20

- `a6f93e9` add roller feature to specific channel or DM

### 2026-02-11

- `9629292` 新增移除管理員功能，包含指令用法及錯誤處理；更新多個檔案以支援新功能及翻譯。

### 2026-04-09

- `ef35016` 新增轉移私人語音頻道擁有權的功能，包含指令用法及錯誤處理；更新多個檔案以支援新功能及翻譯。

### 2026-06-22

- `517093a` 修正指令前綴的設定鍵名稱，改用正確的 'prefix' 而非 'command_prefix'

### 2026-06-23

- `a06857c` 重構專案結構：將核心邏輯從 main.py 拆分至 core/ 模組，並統一伺服器事件記錄至 server_logger 套件；新增服務條款、隱私權政策、README 文件及啟動腳本。
- `85a72b9` 重構更新模組以支援公開與私人儲存庫；移除 `auto_restart` 設定並簡化檢查邏輯
- `da6c953` 從自述檔案中移除對服務條款與隱私權政策的連結；回歸簡化的授權章節

### 2026-06-26

- `fc568a6` 新增日誌批次處理機制：實作 LogBatcher 以緩衝伺服器日誌嵌入，並定期批次發送；將 `_send_log_embed` 改為非同步排隊，並於關閉時強制清空
- `e00d24f` 為更新指令新增自動重啟支援：擴充 `restart_bot` 函式以跨平台重啟程序；在 `update` 指令與 `perform_update` 中傳遞 `auto_restart` 設定；於預設設定檔中加入 `auto_restart` 選項
- `f508cba` 新增更新完成後的重啟確認按鈕：實作 RestartConfirmView 以提供互動式重啟/取消按鈕（僅 owner 可操作）；根據 auto_restart 設定決定自動重啟或手動選擇；優化結果嵌的文字提示
- `84f749f` 重構專案結構，將 R6 資料移至 shared/r6 並新增網站管理後台：搬遷 `maplist.json`、`operatorlist.json`、`mapsgrap.py`、`opsgrap.py` 至 `shared/r6`；更新 `randommap.py`、`randomops.py`、`database.py` 路徑；修正 `r6update.py` 條件判斷缺失；新增 `website-part` 使用者認證系統、SQL 注入防護中介層及 R6 抽選頁面
- `83e63fd` 修正 requirements.txt 換行，補上遺漏的 requests 與 beautifulsoup4 相依套件
- `74ec6fe` 修正重啟流程：統一子行程建立旗標；修復 stop_bot 於 bot 未執行時的提前退出問題
- `8707888` 重啟前關閉 HTTP session 並為 restart_bot 補充 os._exit 註解

### 2026-07-07

- `f283974` 修正 r6update 非同步呼叫並避免 opsgrap 重複擷取：使用 asyncio.to_thread 執行同步爬蟲；編輯結果嵌時增加 session 失效容錯；opsgrap 引入 seen_names 去重

### 2026-07-12

- `dec5fce` 新增網站管理後台與 RBAC 權限系統：加入使用者角色管理、Discord 伺服器檢視功能；資料庫升級支援角色與外鍵關聯；實作管理員中介層與前後端 CRUD 操作；調整 roller 頁面取消強制登入限制；更新 README 文件
- `b4cff64` 修正 db.js 建立連線池時未傳入 port 設定，確保使用 config.json 中指定的資料庫埠號

### 2026-07-20

- `9d3128e` Remove website-part from discord-only branch
- `696f7d5` Remove discord-part from website-only branch

### 2026-07-21

- `f15ba3b` Merge pull request #2 from QEXLAUWASD/website-only
- `c2b18de` Merge pull request #1 from QEXLAUWASD/discord-only
- `e61f681` Remove obsolete code and simplify project structure
- `de9c340` 整合 Discord 與網站分支並恢復完整專案
- `c91c364` 移除過時程式碼並精簡專案結構

### 2026-07-22

- `0ebc8ea` Add website connection management and proxy support
- `f27fb53` 新增網站管理腳本，支援 PM2 啟動/停止/重啟/初始化
- `648872e` Add website account updates and connected-site dropdown
- `e37245b` Add account settings navigation and validation
- `59c8a86` Add persistent sessions and remember-me login support
- `1d177d6` Add authenticated WebSocket proxy support
- `952d537` Add hidden flag for website connections
- `bfa2ebd` Support assigning multiple groups to users

### 2026-07-23

- `e08eb7d` docs: add codebase optimization design
- `7902ee0` docs: add codebase optimization plans
- `e343e82` chore: ignore local worktrees
- `35c7042` test: add Python quality baseline
- `b35ae9e` refactor: centralize Discord database migrations
- `904588c` fix: migrate legacy private voice schema
- `0cbb3c3` fix: make private voice settings persistent
- `e819fe0` fix: preserve private voice migration state
- `beb243d` fix: make private voice trigger updates atomic
- `7733ad1` fix: use aware UTC timestamps in member logs
- `52b8ca5` fix: accept private voice channel mentions
- `0d1ef92` fix: validate private voice channel references
- `f17e0f6` fix: make bot updater credential-safe
- `27e5b3f` fix: keep updater credentials out of argv
- `c3c4574` fix: keep updater work off Discord event loop
- `bb2c6a5` fix: prevent concurrent updater runs
- `24cb1a8` fix: reload updater modules on event loop
- `4e23cf0` fix: hold updater lease through module reload
- `49a89c9` fix: redact command exception details
- `7a5a2ba` fix: route command errors through bot logger
- `f6ede06` fix: redact R6 roll exception details
- `e8a987b` fix: load only async command functions
- `49aa971` fix: require restart to apply updater changes
- `0649db4` docs: clarify updater restart requirement
- `6d240b7` fix: correct updater help descriptions
- `7e79468` fix: prefer localized command descriptions
- `0a953d7` fix: restore private voice lifecycle state
- `cfdff2f` fix: compensate private voice persistence failures
- `b6dbcc1` fix: scope private voice ownership by guild
- `5b4b60b` fix: restore safe updater origins on failure
- `0b1e1eb` fix: reject malformed updater origin URLs
- `7ae1eab` fix: validate updater origin URLs strictly
- `afa6af7` test: add frontend API client foundation
- `979a24f` fix: support backend API error messages
- `f3299b1` fix: share auth state and verify logout
- `8d816d2` fix: keep account mutation errors on page
- `747df5f` fix: gate account and logout controls on auth
- `3102538` feat: add accessible keyboard tabs
- `ebbc5ce` fix: isolate accessible tab state
- `ca14bca` fix: support nested tabpanel roots
- `fd1dc3c` feat: add accessible admin dialogs
- `db52aba` fix: synchronize stacked dialog focus
- `7f7abca` fix: preserve dialog session focus fallback
- `73ee873` refactor: remove inline frontend handlers
- `e2e88d6` fix: normalize frontend request states
- `c8f7187` refactor: share website navigation markup
- `6a10146` feat: improve frontend accessibility states
- `04e5b5c` fix: honor hidden frontend controls
- `e4df6a9` refactor: share roller API handling
- `ff72bf3` refactor: separate website app from startup
- `ce29023` fix: enforce secure production sessions
- `eb74ae1` fix: rotate and revoke website sessions
- `2881af1` fix: rate limit authentication attempts
- `de15949` fix: protect the website admin group
- `2bfb8ac` refactor: replace SQL blacklist with typed validation
- `a1008cc` refactor: split website database repositories
- `4354bed` perf: cache roller data and clean sessions
- `5073085` fix: preserve upstream root redirects
- `46dd3e8` refactor: centralize Discord config updates
- `a205891` perf: cache Discord R6 data
- `511a6b6` perf: batch and parallelize website queries
- `1a5d39d` refactor: remove deprecated logger shims
- `035ba6c` docs: align setup examples with runtime config

### 2026-07-24

- `00d57b5` ci: validate Python and website on Windows and Linux
- `f6268c4` perf: offload Discord repository calls
- `975e1b3` Merge pull request #3 from QEXLAUWASD/codex/codebase-optimization
- `9057279` Rewrite README documentation for current bot and website setup
- `d3580b6` feat: add community event management
- `c5bb4e1` fix: restore slash command message adapter
- `bf30bcb` fix: restrict event creation to admins
- `fe6243e` fix: reset announcement form after submission
- `52faec9` fix: use UTC+8 for event and announcement times
- `fbc2629` fix: handle missing session on home redirect
- `66b9f7e` fix: interpret database timestamps as UTC
- `120eee1` feat: dispatch scheduled announcements from bot
- `89c8d6f` feat: select announcement guilds and channels
- `53cd982` fix: preserve Discord snowflake IDs in MySQL

### 2026-07-25

- `3379ba3` Configure website server bind address

### 2026-07-26

- `9935af3` refactor Discord bot and harden website routes
- `7d41216` Merge pull request #4 from QEXLAUWASD/codex/discord-refactor
- `922f9cd` Allow rewriting redirects between loopback upstream aliases
- `5ad05e9` fix: route proxied root requests back to connection
- `c378837` fix: rewrite proxied html root assets

### 2026-07-27

- `7b622c1` fix: rewrite proxied relative html assets
- `f65fc13` fix: strip proxied browser policy headers
- `48308f7` fix: preserve proxied meta content attributes
- `747ec92` Add PWA install metadata and mobile connections route
- `e0a60d0` fix: align proxied origin headers
- `d709727` fix: preserve proxied upstream cookie names
- `7aedfd6` fix: preserve upstream internal connect paths
- `a80f9e6` fix: preserve target base for marked daemon sockets
- `4e30872` feat: add legacy proxy routing option

### 2026-07-29

- `fc0f166` fix: route new proxy WebSockets to upstream root
- `29d735d` fix: preserve upstream base for proxied WebSockets

### 2026-07-30

- `3b70e3c` fix: support native WebSocket request headers

### 2026-07-31

- `eb083ce` Add remote SSH and RDP client support
- `45a089d` Add protected remote connection profiles and terms consent
- `86619f0` Document and configure website access controls
- `d477240` Hide remote entry when features are disabled

### 2026-08-06

- `f63bebc` Add configurable website page visibility
- `f1402a9` Make Chromium workspace self-contained
- `99c3c1e` Handle external Chromium destinations

### 2026-08-13

- `9f263af` fix: keep sessions available after cleanup errors

### 2026-08-14

- `a673982` Add browser-based WebRDP support and harden configuration handling
- `ef16157` Document PM2 dependency update procedure
- `cf771bf` fix: load WebRDP client bundle correctly
- `b3c2c5c` Add native WebView workspace launcher
- `5541023` Replace native Chromium launcher with Hyperbeam
- `483e158` Replace Hyperbeam with Puppeteer CDP screencast
- `402f7df` Support remote Chrome CDP for OpenWrt
- `2119cc5` Allow Chromium WebSocket upgrades through proxy handler
- `88edcc8` Log Chromium CDP session failures
- `890ec12` Expose Chromium CDP error details
- `bcb175d` Document database migrations, configuration, and API usage

### 2026-08-20

- `e3f8e44` Add website Docker CLI deployment

### 2026-08-21

- `85a36b6` Add audit log actor attribution
- `b5ba6f1` Fix Discord manager settings payload

### 2026-08-22

- `11aa991` Fix guild audit actor lookup
- `32c616f` Retry audit log actor lookup

### 2026-08-24

- `a41df93` Improve exception details in colored logging
- `741eb75` Accept audit action names in actor lookup
- `b5b4e9b` Increase audit log lookup retries and fetch limit
- `1ce1ece` Configure private voice trigger channels in guild manager
- `8b6d087` Add migration for Discord guild channel types
- `abfd23d` Accept numeric audit log action values
- `42a2607` Centralize Discord user target parsing and clean up imports
- `9042286` Support unknown numeric audit log actions
- `919879a` Support audit actors for permission changes and forced voice moves
- `521b269` Add audit-log fallback for member move attribution

### 2026-08-29

- `f1387fd` Add interim VLESS tunnel configuration page
- `e5a9f22` Document production dependency refresh for VLESS tunnel
- `7f1f0ab` Support VLESS Reality tunnel output

### 2026-09-02

- `396b494` Require_terms_acceptance_during_registration

### 2026-09-04

- `eeb9592` Harden remote security boundaries
- `71ba472` Restore remote allowlist compatibility
- `bf2875a` Allow configured Chromium private destinations

## 目前版本重點

- Discord 端支援 R6 抽選、私人語音頻道、權限與管理指令、多語系、事件／稽核記錄及 Git 更新器。
- Website 端為 React（Vite 建置）多頁應用，支援帳號與 session、RBAC、群組／伺服器管理、活動公告、連線代理、SSH／RDP／WebRDP、Chromium CDP 與 VLESS Tunnel。
- 部署需特別確認 session secret、SSH／RDP／Chromium allowlist、資料庫設定、簽署 Git commit 信任鏈及網站服務啟動方式。


## 2026-09-05 — RDP 客戶端重建

- 以模組化客戶端取代舊 webrdp.js：集中連線狀態、bitmap 解碼與輸入生命週期。
- 修正重連時累積事件監聽、全域鍵盤攔截、縮放座標與擴充鍵旗標。
- 修正未壓縮畫面的像素格式／方向，以及舊 RLE 解碼器的 24-bit 紅藍通道；解碼資料在釋放記憶體前複製。
- 增加連線逾時、取消、晚到事件防護與輸入驗證；實際連線使用驗證後 IP。
- 連線前重載 session；斷線與關機會清理仍在協商中的 RDP TCP socket。
- 密碼送出後清空，斷線後需手動重連；保留現有設定檔與 .rdp 下載功能。
- 新增 RDP 單元／回歸測試與可重跑的 Puppeteer 瀏覽器 smoke test。
- 真實 Windows RDP 主機未連線測試；完整網站測試另有兩項既有失敗（session secret 測試值與代理 CSP 預期）。

## 2026-09-05 — RDP 內網允許清單修正

- 依使用者授權，允許明確符合 RDP_ALLOWED_HOSTS 的內網主機或 IPv4 CIDR。
- 修正通過允許清單後仍被內網 IP 檢查拒絕的問題；空清單及清單外限制維持不變。
- 保留驗證後 IP 連線與現有 SSH 規則。
- 補上 .env 範例、README 與回歸測試，包含使用者提供的 192.168.0.1/24 寫法。

## 2026-09-05 — 每帳號多組加密 RDP 設定

- 新增 migration 016 與 website_rdp_profiles，支援每位使用者多組命名連線。
- 新增帳號隔離的清單、新增、讀取、更新及刪除 API；清單不回傳密碼。
- 依使用者要求，連線資料與密碼使用 AES-256-GCM 加密保存；不寫入 localStorage。
- 新增設定選單、名稱、新增／載入／儲存／刪除控制；更新時密碼留空保留舊密碼。
- 保留舊版單組設定，提供另存為命名設定的流程；需設定 REMOTE_CREDENTIAL_ENCRYPTION_KEY。
- 補上 API、加密、跨帳號隔離、migration 及前端操作測試與文件。
- 驗證：新增測試與瀏覽器 smoke test 通過；完整網站測試 230 通過、2 項既有失敗。未連線實際 MySQL 或 Windows 主機驗證。


## 2026-09-05 — 修正網站 CI 測試

- 修正 production session secret 測試 fixture，使其符合程式要求的至少 32 字元長度。
- 更新 WebSocket proxy header 測試，驗證目前保留 upstream browser security policy headers 的行為。
- 本機工作區工具暫時無法啟動，因此修正已直接提交至 `master`，待 GitHub Actions 重新驗證。

## 2026-09-17 — 網站前端改寫為 React

- 以 React 18 與 Vite 重寫 website-part 前端，Express 路由、session、頁面權限與 page visibility 行為維持不變。
- 保留原本的頁面網址（`/login.html`、`/index.html`、`/roller.html`、`/admin.html`、`/remote.html` 等），每個入口只掛載同一個 React bundle。
- 新增 `website-part/frontend/`：`src/pages` 為各頁面元件、`src/components` 為導覽／tabs／modal／toast、`src/hooks` 為 auth、page visibility、busy-state 與 toast hooks。
- 與框架無關的邏輯改放在 `frontend/src/lib`：API client、auth store、dialog 焦點管理、Chromium session 及 RDP client／input／bitmap。
- CSS、圖示、manifest 與 Socket.IO／RDP 解碼器等第三方資源移至 `frontend/static`，建置後輸出到 `website-part/public`（含 `/assets/*.js`，已納入版本控制）。
- 前端測試改為 React 元件測試，使用 `node:test` + jsdom，並以 esbuild JSX loader 轉換 `.jsx` 與 JSX 測試檔；CI 新增重建檢查，`website-part/public` 過期會直接失敗。
- 未連線實際 Windows RDP 主機或 MySQL 驗證；`npm run check`（語法檢查、建置、227 項測試）全部通過。

## 2026-09-17 — 修正新資料庫無法註冊帳號

- 實際啟動網站後發現註冊 API 回 500：`ER_DATA_TOO_LONG: Data too long for column 'id'`。
- 原因：migration 001 將 `website_users.id` 及所有 `user_id`／`created_by` 欄位設為 `VARCHAR(30)`，但程式使用 `crypto.randomUUID()`（36 字元），因此由 migration 建立的新資料庫完全無法新增帳號。
- 新增 migration 017：先由 `information_schema` 讀出參照 `website_users` 的外鍵（含刪除／更新規則）並 drop，將上述欄位擴為 `VARCHAR(64)`，再依原規則重建外鍵；長度已足夠的欄位會跳過，可安全重跑。
- 驗證：以本機 MariaDB 10.11 實際套用，16 個欄位變為 `varchar(64)`、9 個外鍵全部還原，之後註冊、登入、頁面與 API 請求全部成功；另新增 2 個 migration 回歸測試。
