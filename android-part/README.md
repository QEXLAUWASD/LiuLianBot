# LiuLianBot Android

`0.2.0-beta.1` 是 Java / Android Views 原生 App，支援 Android 8.0（API 26）以上，
預設連接 `https://www.liulian.dev`。介面沿用網站的深藍底色、藍色重點、側欄、卡片與
LLB 圖示；本站操作不使用 WebView、不跳到外部瀏覽器。

## 原生功能與 API

| 功能 | App 操作 | API |
| --- | --- | --- |
| 帳戶 | 登入、註冊、登出、改名、改密碼、條款、Discord 一次性連結／解除 | `/api/auth/*` |
| R6 | 進攻／防守幹員與裝備、地圖抽選、幹員資料庫 | `/api/roller/*` |
| 活動 | 建立、參加者、報名／取消，原生日期時間與通知頻道選擇 | `/api/events/*` |
| 檔案 | 磁碟／資料夾、下載、上傳、新增資料夾、重新命名、刪除、多選 ZIP | `/api/files/*` |
| 分享 | 建立、撤銷、分享碼／網址、公開資料夾、單檔／多選 ZIP／整個分享下載 | `/api/files/shares*`, `/api/files/shared/*` |
| 檔案權限 | 申請權限、擁有者授權讀取／寫入／分享 | `/api/files/access*`, `/api/files/permissions` |
| Discord | 可管理伺服器、語言、紀錄頻道、私人語音觸發頻道 | `/api/guild-manager/guilds*` |
| 管理台 | 使用者、群組、連線、頁面權限、活動可見度、排程公告、伺服器資料、統計 | `/api/admin/*` |
| SSH | 連線、指令、Ctrl+C／Tab／Esc、輸出、設定儲存 | `/api/ssh` WebSocket, `/api/remote-profile` |
| RDP | 原生畫布、觸控滑鼠、實體／畫面鍵盤、捲動、全螢幕、命名設定、匯出 `.rdp` | `/socket.io/`, `/api/rdp/*` |
| Chromium | 啟動、導覽、原生串流畫面、點擊／拖曳／捲動、文字／鍵盤、關閉 | `/api/chromium/ws` WebSocket |
| VLESS | 合併 VLESS／Clash 設定、複製、儲存檔案 | `/api/vless-tunnel/generate` |
| 網站連線 | 授權連線清單與資訊、管理員連線 CRUD | `/api/connections`, `/api/mobile/connections/:slug` |

**第三方網站邊界：**「網站連線」可指向任意外部服務。清單與設定已原生化，但不會把
第三方 HTML 假裝成原生功能；App 沒有 WebView，也不啟動外部瀏覽器。
目前沒有提供這些外部服務的 API 文件，因此尚未實作其內容操作。
`www.liulian.dev` 是主站，已由上列原生功能接入；其他服務需要各自的 API 與原生適配器。

網站仍负责 MySQL、權限、SFTP、SSH／RDP bridge、Chromium 與 VLESS 設定。
原生 App 不會在手機內啟動這些伺服器服務，亦不是 VPN 客戶端；VLESS 功能與網站一樣
只產生設定。所有存取仍受現有登入、群組、檔案授權、遠端允許主機清單與功能開關限制。

## 必須先更新網站後端

此版需要本次網站更新提供的：

- `GET /api/auth/terms-document`：與 React 頁面共用的條款 JSON。
- `GET /api/mobile/capabilities`：HTTP／WebSocket／Socket.IO 能力目錄。
- `GET /api/mobile/openapi`：OpenAPI 3.0.3 文件。
- `GET /api/mobile/connections/:slug`：授權連線 JSON 資訊。
- RDP `infos.bitmapFormat = "rgba"` 與原生 RGBA bitmap 回應。
- Chromium key input 可選 `modifiers`（0–15）。

部署網站時一併部署 `shared/website/terms.json` 與 `website-part/frontend/src/lib/rdp/rdpBitmap.mjs`。
Dockerfile 已包含共用條款。保留網站原有環境設定，執行網站 `npm ci && npm run build` 後
依現有方式重啟網站。App 不會自動部署或修改正式站台。

以 `curl https://www.liulian.dev/api/mobile/capabilities` 確認新 API 可用，再安裝測試 APK。
舊後端仍可使用大部分既有 JSON 功能，但條款、連線資訊與原生 RDP 需要升級。

完整合約見 [API 參考](../docs/API.md) 及 [OpenAPI 文件](../docs/openapi.json)。
網站原本的 Browser RDP 事件保持相容，只有明確選擇 `rgba` 的原生客戶端使用新格式。

## 建置及測試

需求：JDK 17、Android SDK Platform 35、Build Tools 35.0.0。
已附 Gradle 8.11.1 wrapper 與發行檔 SHA-256，AGP 固定為 8.9.2。

```sh
cd android-part
./gradlew testDebugUnitTest lintDebug assembleDebug
```

Windows 使用 `gradlew.bat`。Android Studio 可開啟 `android-part/`。
SDK 位置使用 `ANDROID_HOME` 或未提交的 `local.properties`。
Debug APK：`app/build/outputs/apk/debug/app-debug.apk`。

使用 OkHttp 4.12.0 及 Socket.IO Java 2.1.1 傳輸；測試使用 MockWebServer 與 Robolectric。
測試涵蓋 HTTPS、cookie／來源隔離、檔案串流、原生畫面及登入操作、SSH WebSocket、
Socket.IO RDP 二進位影像、RGBA 色彩／邊界與鍵盤映射。
原生渲染截圖輸出至 `app/build/reports/screenshots/`，是模擬 API 資料的 Android View 截圖。
GitHub Actions 保存 APK、測試／Lint 報告及截圖。

仍需在真實手機與部署後端驗收：加密記住登入、Android 檔案選擇／大檔案、真實 SSH／
Windows RDP／Chromium、群組及檔案權限。自動化 transport 測試使用模擬伺服器，
不代表已連到正式 Windows 桌面。

## Session、設定與操作

- 使用有效 TLS 的 HTTPS 根網址；不接受 HTTP、帳密網址、子路徑部署或略過憑證驗證。
- 預設 session 留在程序記憶體；畫面旋轉保留 session，程序結束後重新登入。
- 可勾選「記住登入」，由網站設定最長 30 日 cookie，裝置以 Android Keystore／
  AES-GCM 加密保存，並以網站來源綁定。密碼不寫入裝置磁碟。
- 登出、401 或切換網站會清除原 session 與加密保存的 cookie。
- 遠端設定可選擇以 Android Keystore 加密存於裝置；本機設定排除密碼。
  伺服器命名 RDP 設定可明確勾選保存密碼，沿用網站的伺服器端加密。
- SSH／RDP／Chromium 不自動重連。離開畫面、進入背景或關閉 App 時斷線，避免
  遠端持續收到輸入；返回後手動重連。
- 檔案下載／上傳使用 Android 系統文件選擇器與串流，不把整個 ZIP 放進記憶體。
  失敗下載會嘗試移除不完整檔案。若選檔期間程序被回收，需重新發起操作。
- 第三方服務、正式後端部署、推播通知、離線模式不會由本次 App 自動建立。

Debug APK 只供 Beta 測試。不同環境產生的 Debug 簽章可能不同，正式發行也會改用
正式簽章；簽章不同時須先移除舊版再安裝。簽章金鑰不得提交至版本庫。
