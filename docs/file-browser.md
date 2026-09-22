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

檔案頁採用深色緊密列表與藍色資料夾圖示，顯示名稱、修改時間、儲存空間、類型、大小及建立時間；窄螢幕可水平捲動。點選資料夾名稱進入目錄，每列「•••」選單提供依權限開放的操作。時間以瀏覽器本地時區顯示；SFTP 未提供建立時間，因此顯示「—」。

根目錄列出可用的 `vol*` 磁碟名稱，每個名稱實際映射到該磁碟的 `1000` 目錄。支援目錄導覽、目前目錄名稱篩選、單檔下載、上傳、新增資料夾、同磁碟重新命名／移動及刪除。上傳上限為 1 GiB，採排他建立，不覆蓋既有檔案；失敗的上傳會嘗試清除部分檔案。資料夾僅可在為空時刪除，磁碟根目錄不可重新命名或刪除。

檔案頁可用每列的核取方塊多選檔案與資料夾（表頭核取方塊全選目前清單），或直接在資料夾列的「•••」選單按「打包下載」，把選取內容串流成單一個 ZIP。打包在 Router 上邊讀邊寫，不會在 Router 暫存整份內容；單次最多 50 個選取項目及 2000 個壓縮項目，未壓縮總大小上限為 4 GiB（ZIP32 格式上限）。已壓縮的影音與壓縮檔副檔名以原樣存放，避免浪費 Router 的 CPU；空資料夾仍會保留在壓縮檔內；不同磁碟的同名項目會改用完整 `/vol*/1000` 相對路徑，避免在壓縮檔內互相覆蓋。

壓縮檔名在單一選取時沿用該項目名稱加 `.zip`，多選時為 `FnOS-YYYYMMDD-HHMM.zip`；非 ASCII 名稱透過 `Content-Disposition` 的 UTF-8 形式傳遞。支援 File System Access API 的瀏覽器會先要求儲存位置，並把建議檔名一併送到伺服器（伺服器會再次驗證），其餘瀏覽器則以 blob 下載。

分享頁（`/share.html`）同樣可以勾選資料夾內的項目並按「打包成 ZIP 下載」；分享沒有登入 session，因此選取內容以表單欄位（重複的 `paths`）送出，由瀏覽器原生下載 ZIP。分享的打包一律以分享根目錄為界，超出範圍、單一檔案分享或無有效分享碼都會被拒絕。

路徑跳脫、符號連結及特殊裝置檔案均不開放。這是應用程式的路徑限制，SFTP 帳號本身仍應限制於預定資料範圍；不要讓不受信任的其他程序同時替換目錄或符號連結。

## 分享碼

有分享權限者可建立 1 至 168 小時有效的檔案／資料夾分享。任何持有分享碼者皆可免登入讀取該分享內容；資料夾分享包含其子目錄及之後新增於該路徑的內容，不是固定快照。持有分享碼者可把資料夾內勾選的項目打包成單一 ZIP（單一檔案分享請直接下載）。沒有公開寫入或檔案預覽功能。

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

啟動時 migration `018` 建立 `website_file_permissions` 與 `website_file_shares`（migration `017` 已將用戶 ID 欄位擴至 `VARCHAR(64)`，檔案相關欄位亦依此設定）。

已部署過本功能舊版的資料庫有個特別情況：當時未發佈嘅檔案 migration 已佔用版本 `017`，令 `017` 的 UUID 欄位加寬被略過。`019` 會重新執行同一段加寬邏輯（逐欄檢查，已足夠寬就跳過），所以無論資料庫係全新、已套用上游 `017`，抑或由舊版檔案功能升級，最終欄位寬度都一致。

既有 session、帳號及網站功能不變。部署前備份修改檔案與 `.env`，然後以原有程序管理器重新啟動網站。反向代理必須允許預期的上傳大小與持續時間。

驗證：在 `website-part/` 執行 `npm run check`（會檢查 JSX 語法、重新建置 `public/` 並執行後端及前端測試，包括 `test/files.test.js`、`test/file_archive.test.js`、`test/frontend/files_page.test.mjs` 及 `test/frontend/share_page.test.mjs`）。`public/` 係已提交嘅建置產物，改動前端後必須一併重建。實機需另確認 SFTP 登入、磁碟清單、上傳／下載、ZIP 打包下載、LiuLian 授權以及未登入分享頁；自動化測試不代表實機 SFTP 驗證已完成。
