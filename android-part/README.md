# LiuLianBot Android

原生 Java / Android Views App，直接使用既有 Express JSON API，無需修改網站後端。
支援 Android 8.0（API 26）以上。

## 功能

- 設定 HTTPS 網站根網址並驗證 API 連線。
- 使用網站帳戶登入、查看身份、登出。
- R6 進攻／防守幹員裝備及地圖抽選。
- 查看活動、報名及取消報名；遵循網站活動與頁面權限。
- 原生授權連線清單，以系統瀏覽器開啟連線服務。
- API 錯誤、連線逾時、空清單及登入失效提示；網路請求在背景執行。

註冊與條款閱讀／接受透過網站完成。管理員功能、SSH、RDP、Chromium、VLESS、
推播通知與建立活動尚未移植到原生介面。

## 建置

使用 JDK 17、Gradle 8.11.1、Android SDK Platform 35。AGP 固定為 8.9.2；
版本相容性參考 [Android 官方說明](https://developer.android.com/build/releases/agp-8-9-0-release-notes)。

已附 Gradle wrapper 與發行檔 SHA-256 驗證，於此目錄執行（Windows 使用 `gradlew.bat`）：

```sh
./gradlew testDebugUnitTest lintDebug assembleDebug
```

Android Studio 可開啟 `android-part/`，使用 JDK 17 與上述 Gradle 版本同步。
SDK 位置可透過 `ANDROID_HOME` 或本機 `local.properties` 的 `sdk.dir` 指定。
Debug APK 輸出：`app/build/outputs/apk/debug/app-debug.apk`。
GitHub Actions 的 **Android** workflow 亦會執行測試、Lint、建置並保存 Debug APK。
正式發佈請使用 Android Studio 的 Generate Signed Bundle / APK，簽章金鑰不應提交。

## 連接網站

1. 先依根目錄 README 啟動網站及資料庫，並設定有效 TLS 憑證的 HTTPS reverse proxy。
2. 手機必須能連到該網站；輸入如 `https://bot.example.com`，不要附 `/api`。
3. 選「儲存並連接」，使用現有網站帳戶登入。
4. 從底部分頁選擇 R6、活動或連線。

不支援 HTTP、自簽但未受裝置信任的憑證、子路徑部署或離線模式。
App 只在本機保存網站網址，密碼及 cookie 不寫入磁碟、不備份。
App 重建或程序結束後需重新登入，切換網站會丟棄原有 session。
不自動重試 POST，以避免重複操作；失敗時請重新整理確認狀態。

瀏覽器不共享 App cookie。首次開啟連線，請先按「在瀏覽器登入網站」，完成登入後
返回 App 再開啟連線。App 不將 cookie 或密碼放入網址。網站原有 user/group/admin
權限及隱藏連線規則繼續由伺服器執行。

## 驗證

`ServerAddressTest` 驗證 HTTPS 網址正規化與拒絕帳密／子路徑等輸入。
CI 執行單元測試及 Android Lint。實機驗收需使用測試網站帳戶：

- 正常／錯誤密碼登入、登出、session 到期後重新登入。
- 抽選結果、空活動清單、報名／取消後人數更新、活動額滿錯誤。
- 無權限帳戶、隱藏連線、瀏覽器獨立登入後連線代理。
- 網站不可達、HTTP 網址、無效 TLS、非 JSON 回應、切換網址。
- 小螢幕、旋轉、背景切換、TalkBack 與鍵盤顯示。

尚未在真實手機與部署後端完成端到端驗收。

2026-09-26 開發環境驗證：JDK 17 / Gradle 8.11.1 / SDK 35 下，
`testDebugUnitTest lintDebug assembleDebug` 成功，2 項單元測試通過，
Android Lint 無錯誤或警告，已產出 Debug APK。這不取代上述實機與真實後端驗收。

## Beta 發行

目前版本 `0.1.0-beta.1`，GitHub 預發行標籤 `android-v0.1.0-beta.1`。
提供 Debug 簽章測試 APK，並非正式商店發行版本；未來正式簽章版本可能需要先移除
Beta 才能安裝。請使用測試帳戶驗收，下載頁會附 SHA-256 校驗檔。
