# LiuLianBot API 參考

本文件記錄 `website-part` 目前由程式碼實作的對外 API。HTTP 路由的註冊入口是
`website-part/src/app.js`；如未特別註明，所有 JSON API 都使用同源的 session cookie
作身份驗證，請求 body 使用 `Content-Type: application/json`。

文件範圍是網站的 HTTP、WebSocket 及 Socket.IO API。Discord prefix/slash commands
是使用者介面，不是 HTTP API；其清單請參考根目錄 README 的 Discord 指令章節。

## 通用規則

- API 根路徑是 `/api`。
- 成功回應通常是 JSON；無內容成功回應使用 `204 No Content`。
- 錯誤通常是 `{ "error": "訊息" }`。前端 `requestJSON` 亦會讀取可選的
  `{ "code": "代碼" }`。
- 未登入一般回應 `401`；沒有管理員或遠端權限回應 `403`；找不到資源回應 `404`；
  輸入驗證通常回應 `400`；重複或狀態衝突通常回應 `409`。
- `POST /api/auth/login` 和 `POST /api/auth/register` 有專用 rate limit。
- Discord ID（guild、channel、user）必須是 15 至 20 位數字字串。

## 認證及帳戶

### 公開／session API

| 方法 | 路徑 | 權限 | 請求 | 成功回應 |
| --- | --- | --- | --- | --- |
| `POST` | `/api/auth/register` | 公開 | `{ username, password, termsAccepted }` | `200 { success: true, user: { id, username }, termsRequired: false }` |
| `POST` | `/api/auth/login` | 公開 | `{ username, password, remember? }`；`remember` 必須是 boolean | `200 { success: true, user: { id, username }, termsRequired }` |
| `POST` | `/api/auth/logout` | 公開 | 無 | `200 { success: true }` |
| `GET` | `/api/auth/terms-status` | 公開 | 無 | `{ required, version }` |
| `POST` | `/api/auth/terms` | 已登入 | `{ termsAccepted: true }` | `200 { success: true }` |
| `GET` | `/api/auth/me` | 公開 | 無 | 未登入 `{ loggedIn: false }`；已登入回傳 `{ loggedIn: true, user: { id, username, role, termsAccepted, remoteAvailable } }` |

註冊及改密碼的 username 長度是 3 至 20 個字元，密碼長度是 6 至 128 個字元。
Terms required 時，註冊必須傳入 `termsAccepted: true`。登入的 `remember: true`
會將 session 最長保存 30 日。

### 帳戶管理（需登入）

| 方法 | 路徑 | 請求 | 成功回應 |
| --- | --- | --- | --- |
| `GET` | `/api/auth/discord-link` | 無 | `{ linked, discordUserId }` |
| `POST` | `/api/auth/discord-link` | 無 | `201 { code, expiresAt }`；代碼為一次性、10 分鐘有效 |
| `DELETE` | `/api/auth/discord-link` | 無 | `{ success: true }` |
| `PUT` | `/api/auth/username` | `{ username, currentPassword }` | `{ success: true, user: { id, username } }` |
| `PUT` | `/api/auth/password` | `{ currentPassword, newPassword, confirmPassword }` | `{ success: true }` |

Discord link code 會由 Bot 消費；網站本身不提供以 code 直接完成連結的 HTTP
端點。

## R6 Roller

以下端點不要求登入，資料來源是 `shared/r6/operatorlist.json` 及
`shared/r6/maplist.json`。

| 方法 | 路徑 | 查詢參數 | 成功回應 |
| --- | --- | --- | --- |
| `GET` | `/api/roller/operator` | `side=att` 或 `side=def`；省略代表兩方 | `{ name, icon, side, primary, secondary, gadget }` |
| `GET` | `/api/roller/map` | 無 | `{ name, location, playlist, gameMode }` |
| `GET` | `/api/roller/operators` | 無 | 原始 Attacker/Defender operator 資料物件 |

資料為隨機選取；沒有可用資料時回應 `404`。

## 活動

`/api/events` 下所有端點都需要登入；建立活動另外需要管理員身份及已連結
Discord 帳戶。

| 方法 | 路徑 | 請求／查詢 | 成功回應 |
| --- | --- | --- | --- |
| `GET` | `/api/events` | 可選 `guildId` | `{ events: [...] }`；事件包含資料庫欄位及 `guild_name`, `creator_username`, `participant_count`, `joined` |
| `POST` | `/api/events` | `{ guildId, channelId?, title, description?, mode?, startAt, maxPlayers? }` | `201 { event }` |
| `GET` | `/api/events/:id/participants` | 無 | `{ participants: [{ id, username, discord_user_id }] }` |
| `POST` | `/api/events/:id/join` | 無 | `{ joined: true, alreadyJoined }` |
| `POST` | `/api/events/:id/leave` | 無 | `{ left }` |

輸入限制：`title` 最長 100、`description` 最長 500、`maxPlayers` 預設 10 且必須
介乎 2 至 99；`startAt` 必須是未來時間；`channelId` 可省略或傳 `null`。只有
可見、狀態為 `open` 且尚未開始的事件會被一般使用者讀取及操作。活動額滿時加入
回應 `409`。

## 網站連線及代理

### 使用者連線清單

| 方法 | 路徑 | 權限 | 成功回應 |
| --- | --- | --- | --- |
| `GET` | `/api/connections` | 已登入 | `{ connections: [{ id, name, slug, description }] }` |
| `GET` | `/api/mobile/connect/:slug` | 已登入 | `302` 重新導向至 `/connect/:slug/` |

連線清單只包含已啟用、非 hidden，且使用者透過 admin、指定 group 或指定 user
取得權限的項目。不存在的項目回應 `404`，沒有存取權回應 `403`。

### 管理員連線設定

以下端點都需要管理員身份。`role_ids` 是正整數陣列，`user_ids` 是符合
`[A-Za-z0-9_-]{1,30}` 的網站使用者 ID 陣列。

| 方法 | 路徑 | 請求 | 成功回應 |
| --- | --- | --- | --- |
| `GET` | `/api/admin/connections` | 無 | `{ connections: [...] }`；每項含 `id, name, slug, target_url, description, enabled, hidden, legacy_proxy_routing, created_at, updated_at, roles, users` |
| `POST` | `/api/admin/connections` | `{ name, slug, target_url, description?, enabled?, hidden?, legacy_proxy_routing?, role_ids?, user_ids? }` | `201 { success: true, id }` |
| `PUT` | `/api/admin/connections/:id` | 同上，會完整取代存取名單 | `{ success: true }` |
| `DELETE` | `/api/admin/connections/:id` | 無 | `{ success: true }` |

`target_url` 必須是 `http://` 或 `https://` 絕對 URL，不可含帳密、query 或
fragment，並會標準化為以 `/` 結尾。`slug` 只接受小寫英數字及連字符，長度 1 至
50。

### 代理路徑

`/connect/:slug/` 會把 HTTP 請求及 WebSocket upgrade 代理到設定的 target。必須
使用有效登入 session，並通過該連線的 user/group/admin 存取檢查。未登入為 `401`、
找不到 slug 為 `404`、沒有權限為 `403`。target 的 HTML、Location、cookie 會由
代理改寫以配合 `/connect/:slug/` 路徑。

## 管理員 API

`/api/admin/*` 下列端點全部需要管理員身份。

### 使用者及群組

| 方法 | 路徑 | 請求 | 成功回應 |
| --- | --- | --- | --- |
| `GET` | `/api/admin/users` | 無 | `{ users: [{ id, username, created_at, role_id, role_name, role_ids, roles }] }` |
| `PUT` | `/api/admin/users/:id` | `{ role_ids: [number, ...] }` | `{ success: true, user }` |
| `DELETE` | `/api/admin/users/:id` | 無 | `{ success: true }` |
| `GET` | `/api/admin/groups` | 無 | `{ groups: [...] }`；群組包含 `id, name, description, user_count` |
| `POST` | `/api/admin/groups` | `{ name, description? }` | `{ success: true, group: { id, name, description } }` |
| `PUT` | `/api/admin/groups/:id` | `{ name, description? }` | `{ success: true, group: { id, name, description } }` |
| `DELETE` | `/api/admin/groups/:id` | 無 | `{ success: true }` |

管理員不能移除自己的 admin 群組或刪除自己的帳戶；內建 `admin` 群組不能改名或
刪除；仍有使用者被指派的群組不能刪除。

### Discord 伺服器、統計及活動管理

| 方法 | 路徑 | 成功回應 |
| --- | --- | --- |
| `GET` | `/api/admin/guilds` | `{ guilds: [...] }`；包含 guild 名稱、語言、管理員數、log/roller channel 及 private voice 數量 |
| `GET` | `/api/admin/guilds/:id` | `{ guild }`；包含 channel、admin IDs 及 `voice_channels` 詳情 |
| `GET` | `/api/admin/stats` | `{ stats: [{ guild_id, command_count, voice_joins, last_day }] }`；統計最近 30 日 |
| `GET` | `/api/admin/events` | `{ events: [...] }`；包含隱藏及非 open 活動 |
| `PUT` | `/api/admin/events/:id/visibility` | body `{ visible: boolean }`；回應 `{ success: true, visible }` |

### 公告

| 方法 | 路徑 | 請求／成功回應 |
| --- | --- | --- |
| `GET` | `/api/admin/announcement-targets` | `{ guilds: [{ guild_id, guild_name, channels: [{ channel_id, channel_name }] }] }` |
| `GET` | `/api/admin/announcements` | `{ announcements: [...] }`；最多最近 100 筆 |
| `POST` | `/api/admin/announcements` | `{ guildId, channelId, content, scheduledAt }`；`201 { announcement: { id } }` |
| `DELETE` | `/api/admin/announcements/:id` | `{ success: true }` |

公告內容長度是 1 至 2000；`scheduledAt` 必須是未來時間，且 `channelId` 必須屬於
指定 Discord server。刪除操作實際上會將尚未發送的公告標記為 `cancelled`。

### 頁面可見度

| 方法 | 路徑 | 權限 | 請求／成功回應 |
| --- | --- | --- | --- |
| `GET` | `/api/page-visibility` | 公開 | `{ pages: { roller, events, account, remote, chromium, vless-tunnel } }`；值會按訪客或 session 計算 |
| `GET` | `/api/admin/page-visibility` | 管理員 | `{ pages, groups, users }`；`pages` 包含設定及指定 roles/users |
| `PUT` | `/api/admin/page-visibility/:pageKey` | 管理員 | `{ public_access, authenticated_access, role_ids?, user_ids? }`；回應 `{ success: true, page_key }` |

可用 `pageKey` 是 `roller`、`events`、`account`、`remote`、`chromium`、`vless-tunnel`。admin 使用者
會看到所有頁面；`remote` 頁面即使可見，仍須通過遠端群組及條款檢查。

### Interim VLESS Tunnel

| 方法 | 路徑 | 權限 | 請求／成功回應 |
| --- | --- | --- | --- |
| `POST` | `/api/vless-tunnel/generate` | 登入及頁面可見度 | body `{ format: "vless" 或 "clash", source: string }`；回應 `{ id, format, config, interim: { name, url, internalTarget, generatedAt, expiresAt, expiresInSeconds } }` |

`vless` format 的 `source` 是每行一個 `vless://` 位址；回應 `config` 會以換行
保留原有位址並加入 interim 位址。`clash` format 的 `source` 是 Clash /
Mihomo YAML；回應會保留原有 YAML、加入 `proxies` 節點，並把 interim 節點加入
所有現有 proxy groups。產生功能需要設定 `VLESS_TUNNEL_ADDRESS` 及有效的
`VLESS_TUNNEL_UUID`；網站只產生設定，實際內部網絡路由由外部 VLESS listener
負責。原有設定不會由網站 API 保存。

## 遠端功能

遠端 HTTP API 需要登入、接受目前條款，並屬於 `REMOTE_ALLOWED_GROUPS` 指定的網站
群組（預設 `admin`）。功能亦受 `REMOTE_SSH_ENABLED` 及 `REMOTE_RDP_ENABLED` 控制。

### 遠端 profile

| 方法 | 路徑 | 成功回應／請求 |
| --- | --- | --- |
| `GET` | `/api/remote-profile` | `{ serverStorageAvailable, features: { ssh, rdp }, profile: object 或 null }` |
| `PUT` | `/api/remote-profile` | body `{ ssh: object 或 null, rdp: object 或 null }`；SSH object 欄位為 `host, port?, username, privateKey?`，RDP object 欄位為 `host, port?, username, domain?`；成功 `204` |
| `DELETE` | `/api/remote-profile` | 成功 `204` |

SSH profile 預設 port 是 22，RDP 是 3389；host、username 及其他欄位會作字元和
長度驗證。沒有設定 `REMOTE_CREDENTIAL_ENCRYPTION_KEY` 時，GET 仍會回報功能狀態，
但不能儲存 server profile，PUT 回應 `503`。server profile 會以 AES-256-GCM
加密儲存；通過權限檢查的 GET 會回傳已儲存的 SSH private key，方便前端重新載入
設定。WebRDP password 不屬於 profile，不會被儲存。

### RDP 檔案

`POST /api/rdp/download` 需要遠端權限，body 為
`{ host, port?, username, domain? }`。成功回應 `200`，Content-Type 是
`application/x-rdp`，並以 `liulianbot-remote.rdp` 作附件下載；RDP 關閉時回應
`404`。

## WebSocket 及 Socket.IO

這些通道都使用同一個 session cookie；除 Chromium 外亦需要遠端權限及對應功能開關。

### SSH：`/api/ssh`

使用標準 WebSocket。連線後傳入 JSON：

- 開始連線：`{ type: "connect", host, port?, username, password? | privateKey? }`
- 寫入 terminal：`{ type: "input", data }`
- 調整 terminal：`{ type: "resize", rows, cols }`
- 關閉 SSH：`{ type: "disconnect" }`

伺服器訊息包括 `{ type: "connected" }`、`{ type: "data", data }`、
`{ type: "error", message }` 及 `{ type: "closed" }`。`SSH_ALLOWED_HOSTS` 若有
設定，host 必須符合清單或 IPv4 CIDR。

### Chromium CDP screencast：`/api/chromium/ws`

此通道目前只檢查登入，不要求遠端群組；`/chromium.html` 頁面路由另外檢查頁面
可見度，但 WebSocket upgrade 尚未重複套用該檢查，因此頁面可見度不能當作此通道
的完整授權邊界。主要訊息如下：

- 開啟：`{ type: "open", url, size?: { width, height } }`
- 導航：`{ type: "navigate", url }`
- 輸入：`{ type: "input", input }`，`input.type` 為 `mouse`、`wheel` 或 `key`
- 關閉：`{ type: "close" }`
- 伺服器回應：`status(opening)`、`ready { url, size }`、`frame { data, metadata }`、
  `navigated { url }`、`closed` 或 `error { message }`

URL 只接受 `http://` 或 `https://`。screen size 預設為 `1280x720`，限制為寬
640 至 1920、高 480 至 1080；每個 session 在 WebSocket 關閉或 timeout 後清理。

### WebRDP Socket.IO：`/socket.io/`

Socket.IO 使用預設 namespace。client 事件：

- `infos`: `{ host, port?, username, password, domain?, screen: { width, height }, locale? }`
- `mouse(x, y, button, isPressed)`
- `wheel(x, y, step, isNegative, isHorizontal)`
- `scancode(code, isPressed)`
- `unicode(code, isPressed)`

server 事件：`rdp-connect`、`rdp-bitmap(bitmap)`、`rdp-close` 及
`rdp-error({ code, message })`。screen size 限制為寬 640 至 4096、高 480 至 2160；
RDP 關閉或未啟用時，Socket.IO handshake 會失敗。

## 來源及維護

若新增或修改 `website-part/src/routes`、`website-part/src/app.js`、
`website-part/src/*_server.js` 或 `website-part/src/rdp_socket.js` 的對外路由／訊息，
請同步更新本文件，並執行：

```bash
cd website-part
npm run check
```
