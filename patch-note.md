# 完整更新紀錄

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
- Website 端支援帳號與 session、RBAC、群組／伺服器管理、活動公告、連線代理、SSH／RDP／WebRDP、Chromium CDP 與 VLESS Tunnel。
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
