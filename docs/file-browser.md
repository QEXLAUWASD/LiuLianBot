# FnOS 檔案瀏覽與分享

網站入口為 `/files.html`，分享入口為 `/share.html`。網站在 Router 執行，檔案透過 SFTP 直接從 FnOS 串流；不在 Router 暫存整個檔案。

前端由 `frontend/files.html` 及 `frontend/share.html` 掛載共用的 React bundle，邏輯分別在 `frontend/src/pages/FilesPage.jsx` 及 `frontend/src/pages/SharePage.jsx`，共用嘅 API 包裝與路徑工具在 `frontend/src/lib/filesApi.mjs`，樣式在 `frontend/static/css/files.css`。伺服器端程式在 `src/routes/files.js`、`src/services/file_storage.js`、`src/services/file_access.js` 及 `src/db/file_*.js`。

## 存取與授權

- `FILES_OWNER_USER_ID` 固定綁定既有的 LiuLian 網站帳號 ID。一般網站管理員不會自動取得 FnOS 存取權；改名亦不會轉移檔案管理權。
- LiuLian 可讀取、寫入、分享所有 `/vol*/1000` 目錄，並管理其他帳號的權限及所有分享。
- 其他使用者先登入網站，在檔案頁面送出申請；LiuLian 在「帳號授權」核准或直接輸入既有帳號授權。
- 讀取、寫入、分享可分別設定；寫入及分享需要同時具備讀取權限。授權適用於全部 `/vol*/1000`，目前不支援逐資料夾授權。
- 撤銷帳號權限立即影響後續 API 請求。已建立的分享碼有獨立期限，若需一併取消，請在「有效分享」撤銷。

## 檔案操作

根目錄列出可用的 `vol*` 磁碟名稱，每個名稱實際映射到該磁碟的 `1000` 目錄。支援目錄導覽、目前目錄名稱篩選、單檔下載、上傳、新增資料夾、同磁碟重新命名／移動及刪除。上傳上限為 1 GiB，採排他建立，不覆蓋既有檔案；失敗的上傳會嘗試清除部分檔案。資料夾僅可在為空時刪除，磁碟根目錄不可重新命名或刪除。

路徑跳脫、符號連結及特殊裝置檔案均不開放。這是應用程式的路徑限制，SFTP 帳號本身仍應限制於預定資料範圍；不要讓不受信任的其他程序同時替換目錄或符號連結。

## 分享碼

有分享權限者可建立 1 至 168 小時有效的檔案／資料夾分享。任何持有分享碼者皆可免登入讀取該分享內容；資料夾分享包含其子目錄及之後新增於該路徑的內容，不是固定快照。沒有公開寫入、目錄壓縮下載或檔案預覽功能。

分享碼含 128 位元隨機值，只顯示一次；資料庫只保存 SHA-256 雜湊。分享連結將碼放在 URL fragment，網頁載入後移除；讀取 API 使用 POST body，避免分享碼出現在 HTTP access log URL。到期或撤銷後，後續存取被拒絕；已開始的下載不會被中斷。

## 部署設定

在網站私有 `.env` 設定：

```dotenv
FILES_OWNER_USER_ID=<existing LiuLian website user ID>
FILES_SFTP_HOST=<FnOS host reachable from Router>
FILES_SFTP_PORT=22
FILES_SFTP_USER=<FnOS SFTP account>
FILES_SFTP_PASSWORD=<password>
FILES_SFTP_HOST_SHA256=<64-character hex SHA-256 of the SSH host key>
```

不可提交真實憑證。SSH 主機金鑰不符或設定缺漏時服務拒絕連線。FnOS 需啟用 SFTP，該帳號需能讀取 `/` 中的磁碟名稱及已授權的 `/vol*/1000`；若要使用寫入，亦需相應的檔案系統權限。網站帳號授權與 FnOS 檔案權限是兩個獨立層次。

啟動時 migration `018` 建立 `website_file_permissions` 與 `website_file_shares`（migration `017` 已將用戶 ID 欄位擴至 `VARCHAR(64)`，檔案相關欄位亦依此設定）。既有 session、帳號及網站功能不變。部署前備份修改檔案與 `.env`，然後以原有程序管理器重新啟動網站。反向代理必須允許預期的上傳大小與持續時間。

驗證：在 `website-part/` 執行 `npm run check`（會檢查 JSX 語法、重新建置 `public/` 並執行後端及前端測試，包括 `test/files.test.js`、`test/frontend/files_page.test.mjs` 及 `test/frontend/share_page.test.mjs`）。`public/` 係已提交嘅建置產物，改動前端後必須一併重建。實機需另確認 SFTP 登入、磁碟清單、上傳／下載、LiuLian 授權以及未登入分享頁；自動化測試不代表實機 SFTP 驗證已完成。
