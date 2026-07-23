# LiuLianBot 全專案相容性重構設計

日期：2026-07-23

## 1. 目標

在保留現有 Discord 指令、網站 URL、API 契約與主要使用流程的前提下，修正已確認的正確性及安全問題，建立測試基線，並移除高價值的重複與冗餘程式碼。

本次採用相容性優先的 B 方案。重構可以調整資料庫 schema、內部模組邊界與測試架構，但不主動造成使用者可見的破壞性變更。

## 2. 不變條件

- 保留 `discord-part/`、`website-part/` 與 `shared/` 頂層邊界。
- 保留現有 Discord 指令名稱、參數、權限規則與回應用途。
- 保留網站 URL、API 路徑及 request/response 的主要欄位。
- 保留目前的多群組授權模型，不退回單一角色欄位。
- 保留 Website Access 的導覽列隱藏語意，已授權的直接連線路徑仍可使用。
- 保留 HttpOnly MySQL session store 與 Remember Me 行為。
- 不導入大型前端框架。
- 不把 Discord 與網站合併為同一個 runtime。

## 3. 已確認問題

### 3.1 Discord 與 Python

- 私人語音資料表沒有符合 upsert 條件的唯一鍵，設定可能重複；移除觸發器沒有同步刪除資料庫設定。
- server logger 將 naive datetime 與 Discord 的 timezone-aware datetime 相減，member join/leave 事件可能拋出 `TypeError`。
- 多個模組在 import 時連線 MySQL 並建表，資料庫短暫不可用會阻止程式載入。
- updater 將 GitHub token 放入 remote URL，可能把 token 持久化至 `.git/config`。
- owner update 指令在 Discord event loop 執行同步 Git 操作，可能長時間阻塞 bot。
- 設定讀寫分散於多個模組，可能造成快取與磁碟內容不一致。
- async 事件內存在同步 MySQL 與檔案 I/O。
- Python 部分沒有正式測試、lint、format 或 CI 品質閘門。

### 3.2 網站後端

- production 允許使用公開的 fallback session secret，cookie 也固定為 `secure: false`。
- `admin` 群組可被改名，但管理權限依群組名稱判斷，可能造成管理介面鎖死。
- 登入與註冊成功後沒有 regenerate session；修改密碼不會撤銷其他 session。
- SQL injection 黑名單會阻擋合法密碼或描述，而且與 parameterized queries 重複。
- roller API 每次請求同步讀取及解析 JSON。
- `db.js` 同時負責 schema、users、roles、connections、guilds 與 sessions，責任過多。
- 多組獨立查詢採串行執行，connection membership 合併也有重複掃描。
- 過期 session 缺少長駐程序期間的定期清理。
- 群組 create/update 的輸入驗證與錯誤格式不一致。

### 3.3 網站前端

- 登出請求失敗時仍會跳轉登入頁，使用者可能誤以為 session 已清除。
- 管理頁多組 API 沒有一致檢查非 2xx 回應，伺服器錯誤可能顯示成空資料。
- modal、tabs、toast 與動態結果缺少完整鍵盤及 ARIA 支援。
- inline handlers 與以 `innerHTML` 組合動態資料妨礙嚴格 CSP，也增加 context escaping 風險。
- navbar、API 呼叫、tabs、HTML escaping 與 CSS 元件有明顯重複。
- `admin.js` 與全站 CSS 過大，修改風險集中。

### 3.4 文件與工具

- README 的 MySQL 設定位置與實際程式不一致。
- 文件提及不存在的 `.env.example` 與 database config example。
- 網站相依文件缺少 `http-proxy-middleware`。
- 沒有 Windows/Linux CI、coverage、lint 或 format 工作流程。

## 4. 目標架構

### 4.1 Python 啟動與資料層

Python 啟動順序統一為：

1. 載入並驗證設定。
2. 建立資料庫連線工廠。
3. 執行可重複的 migration。
4. 建立 repositories 與 services。
5. 註冊 Discord 指令與事件。
6. 啟動 bot。

任何模組 import 都不得執行網路或資料庫 I/O。資料表初始化從 feature 模組移至明確的 migration runner。

建立共用 connection/transaction helper，並按領域分離 repositories：

- private voice repository
- roller repository
- server logger repository
- guild settings repository

Discord 指令與事件只依賴 service 介面，不直接處理 SQL、commit 或 connection cleanup。

### 4.2 Python 設定層

`core.config` 成為唯一設定入口，負責：

- schema/default 驗證
- cache 與 reload
- 原子檔案寫入
- 更新後 cache invalidation
- 提供必要的唯讀 accessor

既有呼叫端逐步移至此介面。過渡期保留薄相容函式，完成引用遷移後才移除 deprecated shim。

### 4.3 網站啟動與服務層

Express app 建立與程序啟動分離：

- `createApp(options)` 建立 middleware、routes 與 error handler。
- 獨立 entrypoint 驗證環境、初始化 pool/migration、呼叫 `listen()` 並掛載 WebSocket。

HTTP 資料流統一為：

1. authentication/authorization middleware
2. schema validation
3. domain service
4. repository
5. response formatter 或 error mapper

`db.js` 對外暫時維持既有 exports，但內部委派至 users、roles、connections、guilds 與 sessions repositories。所有呼叫端遷移完成後再縮小相容層。

### 4.4 網站前端

維持原生 JavaScript，拆出以下 ES modules：

- API client：JSON parsing、非 2xx、auth expiry 與 network error
- auth state：每頁只載入一次目前使用者
- tabs：active state、ARIA 與鍵盤操作
- dialog：focus trap、Escape、focus restore
- DOM utilities：建立安全節點與狀態訊息

移除 inline event handlers，改用 `data-*` 與集中事件委派。不可信資料使用 DOM API 寫入，避免把 HTML escaping 當成 JavaScript attribute-context escaping。

## 5. Session 與安全設計

- production 缺少 `SESSION_SECRET` 時啟動失敗。
- production cookie 使用 `secure: true`，反向代理部署設定正確的 `trust proxy`。
- cookie 保持 HttpOnly 與 SameSite 保護。
- 登入與註冊成功後 regenerate session，再寫入 user 狀態。
- 修改密碼後保留目前 session，但撤銷同一使用者的其他 session。
- 登入及註冊加入限制範圍明確的 rate limiting。
- `admin` 為受保護系統群組，不允許改名或刪除。
- 移除 SQL 字串黑名單，改由型別、格式、長度驗證及 parameterized queries 防護。
- 內部例外不直接回傳給 Discord 或 HTTP 使用者；完整資訊記錄於 logger，對外使用穩定錯誤訊息與追蹤 ID。
- 保留既有 signed session cookie、WebSocket session store 與 connection access 驗證。

## 6. 資料庫 migration

建立帶版本紀錄的 migration runner。每個 migration 必須可安全重跑，且在失敗時阻止服務於未知 schema 上啟動。

私人語音 migration 順序：

1. 讀取既有 trigger/private 記錄。
2. 按 guild、channel 與 config type 選出最新有效記錄。
3. 移除確認為重複的舊列。
4. 加入能支援實際 upsert 語意的唯一約束。
5. 更新 repository 的 upsert/delete 查詢。
6. 驗證移除觸發器後，重啟不會重新載入設定。

不刪除有效使用者、群組、網站連線或 session。涉及 DDL 的 migration 需記錄開始、成功與失敗狀態，並在執行前提供資料備份說明。

## 7. 效能設計

- R6 map/operator JSON 在啟動時載入，更新完成後明確 reload。
- Discord async handler 中的同步 Git 與必要的同步 I/O 使用受控 thread executor；長期可替換為 async driver，但不在本次強制更換資料庫套件。
- 網站獨立查詢使用 `Promise.all`，但 transaction 內保持正確順序。
- connection memberships 使用 `Map` 一次合併，避免每筆 connection 重複 filter 全集合。
- 關聯表寫入改為批次 query。
- session store 加入週期性、可停止的過期資料清理工作。

## 8. 錯誤處理

建立可辨識的 domain/input/not-found/conflict errors，route mapper 負責固定映射：

- input error：400
- unauthenticated：401
- forbidden：403
- not found：404
- uniqueness/state conflict：409
- unexpected error：500，對外不含 DB 或 stack detail

前端 API client 區分 authentication failure、validation failure、server failure 與 network failure。只有明確的 401 才視為 session 失效；其他錯誤保留目前頁面與輸入。

Discord 指令對外回傳可理解的一般訊息與追蹤 ID，logger 保留 command、guild、user 與 traceback context。

## 9. 實作階段

### 階段 1：建立安全網

- 加入 Pytest、Ruff 與 Python 測試結構。
- 保留並擴充現有 Node `node:test` 測試。
- 拆分 app factory 以支援 HTTP 整合測試。
- 建立 migration runner 的測試介面。

### 階段 2：修正高優先問題

- 私人語音 schema/upsert/remove/restart persistence。
- server logger timezone。
- import-time MySQL I/O。
- updater token 與 event-loop blocking。
- production session、session regeneration 與 admin 群組 invariant。
- 前端登出與 API error state。

每個行為修正先加入會失敗的測試，再實作至通過。

### 階段 3：消除高價值冗餘

- 統一 Python config 與 DB helpers。
- 拆分網站 repositories 與共用 middleware/error handling。
- 抽出前端 API、tabs、dialog 與 DOM modules。
- 更新所有內部引用後移除確認無使用的 deprecated shim。

### 階段 4：效能、可及性與文件

- 快取 R6 資料、平行查詢、批次寫入與 session cleanup。
- 完成 modal、tabs、live region 與鍵盤操作。
- 修正 README、設定範例與套件文件。
- 加入 Windows/Linux CI、coverage、lint 與 format checks。

## 10. 測試策略

### Python

- 私人語音 migration、upsert、remove 與 restart persistence。
- timezone-aware join/leave logger。
- import 不觸發 DB 連線。
- DB 啟動失敗與 migration failure 行為。
- updater 不持久化 token，且不阻塞 event loop。
- prefix/slash command 權限與參數相容。
- config atomic write 與 cache invalidation。
- logger batching 與 DB failure handling。

### Website backend

- production secret/cookie/trust proxy 設定。
- login/register session regeneration。
- password change session revocation。
- protected admin group invariant。
- 統一 validation/error mapping。
- roller cache 與 reload。
- connection proxy root-relative redirect/cookie path。
- authenticated HTTP/WebSocket access integration。
- session cleanup lifecycle。

### Website frontend

- API client 對 2xx、4xx、5xx、非 JSON 與 network error 的處理。
- logout 只在 server 確認成功後完成。
- tabs 的 ARIA 與鍵盤狀態。
- dialog focus trap、Escape 與 focus restore。
- untrusted values 不進入 inline handler 或 raw HTML context。

## 11. 驗證與完成標準

- 所有既有 Node 測試保持通過，新增測試全部通過。
- Python Pytest、Ruff 與 compile/AST checks 通過。
- 所有網站 JavaScript 通過 syntax check。
- migration 可在空資料庫與含既有資料的資料庫執行，且重跑不改變結果。
- Discord 指令與網站 API 契約測試證明相容。
- production session 安全設定有自動測試。
- protected HTML、HTTP proxy 與 WebSocket access 有整合測試。
- README 與實際設定來源一致。
- `git diff --check` 通過，工作目錄沒有未預期檔案。

## 12. 非目標

- 不改寫為 React、Vue 或其他大型前端框架。
- 不在本次移除 prefix commands。
- 不更改多群組授權為單一角色。
- 不重新設計網站視覺品牌。
- 不把所有同步 MySQL 存取一次性替換為新 ORM。
- 不更改 Website Access 隱藏連線的直接路由授權語意。

## 13. 風險控制

- 每一階段保持小型、可回復提交。
- 先建立測試，再更改行為或模組邊界。
- schema 變更前確認備份與 migration dry-run 輸出。
- 不在同一提交同時進行 schema、API 與 UI 大型重構。
- 若本機 MySQL 不可用，先完成靜態與 mock 測試；需要真實 DB 驗證的項目不得宣稱完成。
- 對現有 API、Discord 指令與 session 行為執行回歸驗證後才進入下一階段。
