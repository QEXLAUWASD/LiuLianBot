# Patch notes

## Independent VPN users (since `69dc421`, 2026-10-06)

- Separated VPN identities from website login accounts using `website_clash_users`. Migration `022` copies existing identities and replaces the subscription foreign key while preserving IDs, subscription tokens, grants and encrypted per-node credentials. Website account deletion no longer removes VPN access.
- Administrators can create VPN users directly by name, rename/edit expiry and node access, or remove them. Added POST subscription creation with a generated UUID; creation and grant updates are atomic. Removal retains encrypted account records for SSH revocation. The UI no longer fetches website users and names are labels; subscription tokens and generated node credentials provide client authentication.
- Updated README/setup/database guidance, API catalog/OpenAPI and built assets. No new secret files or ignore patterns are required.
- Validation: JavaScript checks, production build and all 387 tests passed (5 added), including independent identity creation/rename/rollback, migration foreign-key replacement/retry, admin authorization/name validation, frontend creation and VPN-only synchronization. Database migration was checked with fixtures; live MySQL/VPS deployment was not performed.

## Clash server and VPN user lists (since `aae9567`, 2026-10-06)

- Reorganized Clash administration into a server list with status, last sync and errors, followed by VPN users with a right-aligned Add action and per-row Edit/Remove actions. Add/edit forms open on demand and can be cancelled; URL rotation remains in the user editor. Added empty states and English/Traditional Chinese copy.
- Added administrator-only subscription deletion. Removal invalidates the subscription URL and cascades grants while retaining the website account and managed account records for background SSH revocation. Deletion serializes with edits using the same user lock and rolls back on missing subscriptions.
- Updated both READMEs, API documentation/catalog, OpenAPI, and built frontend assets. No additional ignore entries are needed.
- Validation: full JavaScript check, production build and all 382 tests passed (5 added). Focused native API checks and a rebuild also passed after updating discovery metadata and styling. Live VPS deployment was not changed.

## Mihomo account management and OpenWrt expiry (since `cde348d`, 2026-10-06)

- Added Mihomo Hysteria2 and VLESS/Reality per-user reconciliation with expiry, namespace preservation, stable disabled sentinels, YAML validation before activation, and restart rollback. Mihomo Hysteria2 uses raw individual passwords, unlike standalone Hysteria2 userpass. Mihomo SS2022 shared-password listeners remain unsupported for individual revocation.
- Added OpenWrt/procd service control and a foreground expiry daemon with immediate/minute cleanup, overlap prevention and sanitized errors. The website worker itself does not require systemd.
- Updated installation guidance, target examples and both READMEs. Read-only SSH inspection of Digi Pro 2 confirmed Ubuntu 20.04.6, Mihomo v1.19.32 and an active expiry timer with zero targets; no VPS configuration or services were changed. The other seven VPS were not inspected.
- Validation: full website JavaScript check, production build and all 377 tests passed (5 added); procd shell syntax and `git diff --check` passed. Live provisioning, VPN connections and expiry were not exercised.

## Admin Clash subscriptions and SSH auto-revocation (since `108ac79`, 2026-10-06)

- Added an administrator-only Clash subscription tab and guarded APIs to create/edit/disable/delete VPN nodes, manage per-user expiry and allowed nodes, rotate URLs, select SSH management profiles, inspect sync status and request retries. English/Traditional Chinese UI uses UTC+8 expiry input.
- Added migrations `020` and `021` for VPN nodes, random subscription tokens, transactional grants and AES-256-GCM encrypted individual accounts. Deletion keeps revocation tombstones; independent credentials are only published after SSH acknowledges successful provisioning.
- Automatically publish current per-user Clash YAML at `/clash-sub/<token>.yaml` with expiry checks and no caching. Unmanaged nodes restrict subscription downloads; managed nodes revoke accounts on expiry, disablement, grant removal, user deletion or node deletion.
- Added SSH reconciliation every 30 seconds with pinned host keys, a fixed command/stdin protocol, sanitized errors, retry and a database lock. Added a root-owned VPS helper for standalone Hysteria2 userpass, sing-box multi-user VLESS/VMess/Trojan/Hysteria2/SS2022 AES, and Xray VLESS/VMess/Trojan. The VPS-local minute timer enforces expiry during website outages; file locking, durable intent, validated atomic config replacement, backups and restart rollback protect updates.
- Updated both READMEs, detailed VPS installation/examples, API catalog/OpenAPI and tracked frontend assets. Ignore real local SSH profiles; the standalone helper reuses the existing js-yaml dependency with a lockfile. Legacy shared VPN credentials require separate rotation; service restarts briefly disconnect other sessions. Actual profile hosts, config paths and service names must be configured before use.
- Validation: `npm run check` passes all 372 tests (27 added since the baseline), covering administrator authorization, publication/expiry, transaction rollback, per-user credentials, SSH pinning/timeouts/retry, failure publication gates, local expiry, config rollback and frontend expiry conversion. Helper dependency lock verifies offline; `git diff --check` passes. Tests use fixtures and temporary files; live MySQL, actual VPN binaries, real VPS SSH and production deployment were not exercised.


## Hong Kong Traditional Chinese interface (since `c57699a`, 2026-10-05)

- Added `zh-HK` / English selection throughout the website, including standalone login/share pages; accepts `zh_hk`, follows supported browser preferences initially and remembers manual choices with a blocked-storage fallback.
- Added an explicit React translation catalog for navigation, dashboard, login/register, accounts, events, administration, rollers and the existing Chinese tool pages. Language changes preserve mounted forms, filters and connections; account/event/file content and protocol values remain untouched.
- Localized accessible labels, page titles, common status messages, interpolated notifications and Hong Kong event-date formatting. Original legal text keeps its `zh-Hant` language annotation; unknown diagnostics retain their source wording.
- Added six localization regression tests and extended browser smoke coverage for form preservation, cross-page/reload persistence, English restoration and mobile layout. Updated both README files and rebuilt tracked frontend assets; no dependency or `.gitignore` changes needed.
- Validation: `npm run check` passes all 345 tests; Chromium desktop/mobile smoke with production CSP passes in English and `zh-HK`. Checks use local API fixtures; Production deployment has not been performed.

## Website review, usability and delivery performance (since `c57699a`, 2026-10-05)

- Refreshed dashboard and login layouts with focused page styles, a lighter CSS-only hero illustration, compact mobile statistics, readable horizontally scrolling tables, and a sign-in form that appears first on mobile.
- Dashboard authentication/loading/error/empty states are distinct. Failed API reads retain unknown counts instead of reporting zero, events and websites can retry independently, pending requests abort on cleanup, and hidden event pages do not display event data. Added clear-filter controls and live result counts.
- Login and terms acceptance share safe return-path validation, preserve the original page/query/hash, and reject external or browser-normalized redirect bypasses. Added password visibility controls, actionable errors and submission guards while keeping existing short-password accounts compatible.
- Fixed navigation keyboard menus, hidden-item focus traps, website-list retries and mobile-to-desktop drawer cleanup. Modals also lock the top bar; notifications stack without overlapping and have keyboard-accessible dismiss buttons. Concurrent page-visibility reads share one pending request.
- Public JS/CSS/image/vendor requests now bypass session middleware. Integration tests verify zero session reads/touches for GET, HEAD and 304, while private HTML and proxy routing retain their guards. HTML revalidates with `no-cache`; share pages retain `no-store`.
- Added `npm run test:website-browser` with deterministic local API fixtures and production CSP; updated both README files and rebuilt tracked `public/` assets. No new runtime dependencies or ignore rules were needed; screenshots and browser libraries remain outside the repository.
- Validation: `npm run check` passes (339 tests, 29 added), Chromium desktop/mobile smoke passes, dashboard/login axe WCAG A/AA checks report no violations, and `git diff --check` passes. Browser checks use fixtures; no live MySQL, production login or real remote-host session was exercised. Production deployment has not been performed.

## WebRDP 解碼器 CSP 相容性修正（基準：`3200c13`，2026-09-28）

- 修正舊版 RLE 解碼器初始化使用 `eval`，遭正式環境的 `script-src 'self'` 阻擋，導致顯示「畫面解碼器尚未就緒，請重新整理頁面」的問題。改為直接初始化並保留既有 Module 設定。
- 新增禁止字串程式碼執行的瀏覽器環境回歸測試，驗證預設／自訂 Module 初始化及真實 16／24 位元壓縮畫面解碼；瀏覽器 smoke test 同步套用正式 CSP 並檢查解碼器就緒。
- 更新解碼器來源聲明、中英文 README 與 `public/vendor/webrdp` 建置產物。
- 驗證：`npm run check`（語法、建置、308 項測試）與 Chromium 瀏覽器 smoke test 均通過；已確認正式 CSP 下的解碼、設定儲存、輸入及重連流程，解碼器原始檔與建置產物逐位元相同。尚未部署或連線真實 RDP 主機。

## Android 0.2.0-beta.2 build and remote reliability fixes (since `56e8b09`, 2026-09-27)

- Fixed session-cookie lifetime handling so session cookies remain available for the App process; bounded RGBA RDP dirty-tile decoding with overflow, size, and queued-byte checks.
- Fixed SSH and Chromium handshake timeouts, SSH terminal buffer trimming, RDP timeout cleanup, RDP canvas stride validation, nested public-share download paths, and stale file-picker state after cancellation.
- Coalesced Chromium frames with connection-aware UI draining so reconnects cannot strand the latest frame or let an old callback recycle a new connection's frame.
- Login responses that require renewed terms acceptance now open the terms screen directly; 401 session clearing also resets the visible identity and page state on the main thread.
- Replaced the full-square PNG launcher asset with an adaptive launcher icon, including the Android 13 monochrome layer and `roundIcon`, removing the Android Lint icon warning.
- Added regression tests for RDP dirty-tile destination coordinates and oversized frame rejection. `testDebugUnitTest` (23 tests), `lintDebug`, `assembleDebug`, and `assembleRelease` all pass.

## Website console polish (since `56e8b09`, 2026-09-27)

- Improved the responsive dashboard shell: the desktop sidebar remembers its collapsed state, while the mobile drawer locks background scrolling, closes with Escape, restores focus to its trigger, and is removed from the keyboard order when closed.
- Added icons and accessible labels to grouped navigation entries so the collapsed rail never shows blank submenu items.
- Added a visible lazy-page spinner, more consistent form typography, balanced headings, card/table hover states, mobile full-width actions, and keyboard-friendly horizontal scrolling for the events table.
- Added explicit labels to the admin announcement controls and column semantics to admin and public-share tables for screen readers.
- Guest dashboard states now avoid private tool links and explain that sign-in is required before showing event data.
- Rebuilt the tracked `website-part/public` output and refreshed the English and Traditional Chinese README feature lists.
- Verification: `npm run check:js`, `npm test` (306 tests), `npm run build`, and `git diff --check` pass.

## 分享資料夾整包下載修正（基準：`29e6a69`）

- 公開分享的唯讀端點允許原生表單在反向代理環境提交，修正「下載整個分享資料夾」回傳 `Cross-site request blocked`。
- 其他 API 寫入仍接受來源檢查；新增公開分享與非公開端點的回歸測試。
- 驗證：`npm run check` 完成語法檢查、網站前端建置，306 項測試全數通過。

## Android 0.2.0-beta.1 原生網站功能移植（基準：`da93039`）

- Android 採網站深色配色、側欄與卡片設計，預設連接 https://www.liulian.dev；移除系統瀏覽器連線流程，不使用 WebView。
- 新增原生帳戶／條款／Discord 綁定、活動管理、檔案與公開分享、存取授權、Discord 伺服器管理及管理員操作畫面。
- 新增原生 SSH、RDP、Chromium 遠端畫面與輸入、命名 RDP 設定及 VLESS 設定匯出；切換畫面或進入背景會關閉遠端連線。
- 登入預設保存在記憶體，可選 Android Keystore 加密記住 session；Cookie 綁定來源，401／登出清除。裝置設定不保存遠端密碼。
- 網站新增共用條款文件、功能 API 目錄、OpenAPI 規格、授權連線 JSON；新增 RDP RGBA 協定及 Chromium 修飾鍵。修正 ACL 接受 UUID 使用者 ID。
- 更新 API 文件、中英文 README、Android 建置說明、Docker context 排除及 CI 測試報告附件。
- 驗證：Android 20 項測試通過，Debug APK 建置成功；Lint 無錯誤，1 項圖示外形建議。網站 305 項測試及前端建置通過。
- 限制：需同步部署新版網站後端；尚未完成真實帳號、實機及真實遠端主機驗收。任意第三方代理網站尚無原生適配器，需個別服務 API 才能整合；不會以內嵌網頁替代。

## Android Gradle wrapper 權限修正（基準：`701d853`）

- 在 Git 記錄 `android-part/gradlew` 的執行權限，修正 Linux CI checkout 後出現 Permission denied；本機檔案權限已設定，但先前未寫入 Git 索引。

## Android Beta CI 修正（基準：`5049656`）

- 明確安裝 Platform 35、Build Tools 35.0.0 及 platform-tools，避免 setup-android 預設下載已下架的 `tools` 套件而失敗。
- 此變更只影響 CI SDK 準備，Beta APK 與 App 功能不變。

## Android 0.1.0-beta.1（基準：`62f200a`）

- 新增原生 Android App：HTTPS 網站設定、登入／登出、R6 抽選、活動報名／取消及授權連線清單。
- 沿用網站 JSON API 與 session；cookie 僅保存在記憶體，連線服務由獨立登入的系統瀏覽器開啟。
- 新增 Gradle wrapper、HTTPS 網址單元測試與 GitHub Actions APK 建置流程。
- 更新中英文 README、Android 建置與驗收文件，以及本機 SDK、快取和簽章檔案忽略規則。
- Beta 使用 Debug 簽章 APK，適用 Android 8.0 以上；尚未完成實機與真實後端端到端驗收。
- 驗證：2 項單元測試通過，Android Lint 無問題，Debug APK 建置成功。

## Since `32635dc`

- Added dependency-free `src/middleware/security_headers.js`: every first-party
  response now carries a strict CSP (`default-src 'self'`, `frame-ancestors
  'none'`, `script-src 'self'`), HSTS (HTTPS only), `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and related headers.
  Third-party pages proxied under `/connect/<slug>/` skip them so the upstream
  site keeps working.
- Added `src/middleware/origin_check.js`, which checks `Origin`/`Sec-Fetch-Site`
  for every non-safe `/api` method and returns `403` for cross-site requests.
- Added `src/middleware/login_throttle.js`, which counts failed (`401`) logins per
  account and returns `429` with `Retry-After`; a successful login clears it.
- Raised the password minimum from 6 to 8 characters and added a common-password
  deny-list. The login endpoint still accepts existing shorter passwords; the
  register and change-password inputs were updated to match.
- Code-split the frontend: `App.jsx` exports `PAGE_LOADERS` and renders them with
  `React.lazy`/`Suspense`, so the login and share pages no longer download the
  admin, RDP or file-browser chunks. The main bundle dropped from 287.89 kB
  (gzip 87.65 kB) to 166.50 kB (gzip 54.14 kB). Added a page-level
  `ErrorBoundary` so a single failing page cannot blank the document.
- Added `vite-plugins/html-head.mjs`, which injects the favicon, manifest,
  theme colour, Open Graph metadata and the private-page `noindex` policy at
  build time. The 14 `frontend/*.html` entries now only keep their title,
  stylesheets and entry script, and `chromium`/`remote`/`vless-tunnel` use
  `lang="en"` to match their English content.
- Added `frontend/static/robots.txt`; fixed the manifest `background_color` to
  `#070b12` and its `start_url` to `/login.html`.
- Static caching: `/assets` is served `public, max-age=31536000, immutable`,
  everything else `no-cache`, and the manual `?v=` query strings are gone.
- Added `GET /healthz`, reporting `200 { status: "ok" }` when the database pool
  answers and `503` otherwise.
- Docs: updated `README.md`, `README_HK.md` and `docs/API.md`.
- Verified with `npm run check` (syntax check, Vite build, 274 tests); rebuilding
  twice produced identical SHA-256 hashes.

- Added a "pack into one file" action to the file browser: every row has a
  checkbox (with a select-all header) and folders offer 打包下載 in their action
  menu. `POST /api/files/archive` streams the selection as a single ZIP straight
  from FnOS, and `src/services/zip_archive.js` is a dependency-free streaming
  writer (deflate or store, data descriptors, CRC-32, UTF-8 names), so the Router
  never buffers a whole archive.
- Archive limits: 50 selections, 2000 entries and 4 GiB of uncompressed content
  (Zip32). Directories expand recursively and keep empty folders, symlinks are
  skipped, already-compressed media and archives are stored as-is, and clashing
  names from different disks fall back to their `/vol*/1000` relative path.
  Single selections download as `<name>.zip`, multiple as `FnOS-YYYYMMDD-HHMM.zip`,
  with the UTF-8 name carried in `Content-Disposition`.
- The frontend asks for the save target while the click is still a user gesture,
  sends that suggestion along, and the server re-validates it before echoing it
  in `Content-Disposition`, so both sides agree on the name. Browsers without
  the File System Access API fall back to a blob download; cancelling the dialog
  stops the request before anything is packed.
- Docs: updated `docs/file-browser.md`, `docs/API.md`, `README.md` and
  `README_HK.md`.
- Tests: added `website-part/test/file_archive.test.js` (writer plus archive plan,
  parsing the produced ZIP structure) and extended `test/files.test.js` and
  `test/frontend/files_page.test.mjs`.
- Verified with `npm run check` (syntax check, Vite build, 286 tests). The
  generated ZIP was also read back with an independent unzip implementation.

### Deployment verification (Router)

- Fast-forwarded `/opt/website/LiuLianBot` from `32635dc` to `645c125`. The local
  `start.sh` change (mode 100755) survived with identical content
  (`2c3402dc…`), the private `.env` was untouched, and PM2
  `liulianbot-website` restarted cleanly on `127.0.0.1:30011`.
- Pre-deployment backup: `/opt/website/backups/zip-pack-20260921T015459Z/`
  (previous HEAD, `start.sh` copy, `.env`/`start.sh` hashes and a tarball of
  `website-part` without `node_modules`).
- `/login.html`, `/share.html`, `/robots.txt`, `/healthz` and the new
  `/assets/FilesPage-CCWVyV-Z.js` answer 200; `/files.html` still redirects to the
  login page without a session, and `/api/files/list` plus
  `POST /api/files/archive` answer 401. First-party responses carry the new
  `Content-Security-Policy`.
- The deployed `public/assets/FilesPage-CCWVyV-Z.js` (`67778cb8…`),
  `public/files.html` (`1782211f…`) and `src/services/zip_archive.js`
  (`67c74ddf…`) match the committed copies by SHA-256, and the JavaScript served
  over HTTP matches the file on disk.
- Live packing test with the deployed code: `vol1/office` (subtree) plus
  `vol1/adguard/docker-compose.yml` produced a 67-entry, 64 kB archive in 10.8 s.
  Every entry passed the CRC check, the Router's own `unzip -t` reported no
  errors, relative entry names and empty folders were correct, and the temporary
  check script plus the sample archive were deleted afterwards. Nothing was
  written to the NAS.

## Since `dddea88`

- Folder shares can be packed into one ZIP from the share page. Recipients check
  rows (or the whole listing) and press 打包成 ZIP 下載; the selection travels as
  repeated `paths` form fields to `POST /api/files/shared/archive`, so the
  browser still downloads natively through the hidden form instead of buffering
  an archive in JavaScript. `SharePage` gained the checkbox column, select-all,
  a selection toolbar and selection reset when browsing into a folder.
- `src/services/file_storage.js` can archive relative to a share root: the base
  folder is resolved again from the share's `source_path` and every selection is
  re-resolved inside it, so a share can never read outside its own folder.
  Single file shares, empty selections and more than 50 selections are refused.
- Fixed a live-found bug: `ZipArchive` wrote the whole archive into the HTTP
  response but never closed it, so a browser download would hang instead of
  finishing. `finish()` now ends the output it owns, and `test/files.test.js`
  asserts over real HTTP that the response ends with the ZIP end record.
- Fixed a second live-found bug: an empty entry name resolved to the share root
  itself, so a request with an empty path started packing the entire shared
  folder. Both archive routes and the storage layer now reject empty names.
- Tests: 291 (`npm run check` passes).

### Deployment verification (Router)

- Deployed `1f9a2a8` and `bd38cf8` (with `a53250f`) into `/opt/website/LiuLianBot`
  by fast-forward, keeping the local `start.sh` mode change, and restarted PM2
  `liulianbot-website`. Backups: `/opt/website/backups/share-zip-20260922T025158Z/`.
- `/share.html` and `/files.html` keep their expected responses (200 / 302
  redirect), and `/api/files/shared/archive` answers `404` for an unknown code.
- Live share-code packing with the deployed code: a temporary share over
  `vol1/adguard` returned `200 application/zip` in 986 ms with one entry, the
  CRC check passed and the Router's own `unzip -t` reported no errors.
  `../etc` and empty selections answered `400`, a single file share answered
  `400`, and an unknown code answered `404`. Both temporary shares were revoked
  and the temporary scripts and archive were deleted.
- During that cleanup the share the user was using (`docs`, `vol7/Project/Docs/docs`)
  was revoked by mistake because it fell inside the "recent" window. It was
  restored immediately (same row, so the same code and expiry still work) and the
  database confirms `revoked_at IS NULL` with the original `expires_at`.

## Since `e2794df`

- Rebuilt the authenticated layout as a console-style frame: `App.jsx` wraps each
  page in `.app-shell` (grid) with the navigation rail next to `.app-main`
  (top bar plus content). The palette is unchanged.
- Turned `frontend/src/components/NavBar.jsx` into a sidebar: brand, the **Main**
  links, collapsible **Workspaces** (Remote, Chromium, VLESS), **Connected
  websites** (`/api/connections`, still fetched once on first open) and
  **Administration** (Discord servers, Admin panel) sections, with the account
  chip, logout and collapse control pinned to the bottom.
- Wide screens can fold the rail down to an icon rail; below 1080 px it becomes an
  overlay drawer opened from the top bar and closed by the backdrop, an outside
  click or `Escape`.
- Added a top bar that renders the section name from `PAGE_TITLES` in `App.jsx`,
  so pages no longer repeat their own header chrome.
- Rebuilt the dashboard: page heading with actions, four KPI cards (upcoming
  events, your signups, connected websites, available tools), a two-column row of
  the priority event list and the tools list, and a full-width panel with a
  search/status/sort filter bar, an event table and pagination.
- The dashboard now reads real data from `/api/events` (join state, capacity) and
  `/api/connections`; event state is Joined / Signup open / Full with search,
  status filter, sorting by start time or signups, five rows per page, and empty
  states while loading or when nothing matches.
- Added `--sidebar-width`, `--sidebar-rail` and `--topbar-height` tokens plus
  `.app-shell`, `.sidebar`, `.topbar`, `.stat-card`, `.split-grid`, `.list-row`,
  `.tool-row`, `.filter-bar`, `.data-table` and `.pager` styles, and removed the
  now-unused `.navbar-inner`, `.nav-toggle`, `.dashboard-hero` and
  `.feature-cards` rules.
- Fixed `.main-content` being widened by its own table on narrow screens
  (`width: 100%` with `max-width`), so all 14 pages now fit without horizontal
  overflow at 390/768/1024/1440 px.
- Bumped the stylesheet query to `?v=20260917-ui3` and rewrote
  `test/frontend/app_shell.test.mjs` for the new frame, adding coverage for the
  dashboard filter/sort/pagination behaviour.
- Verified with `npm run check` (syntax checks, Vite build, 252 tests) and local
  Chromium screenshots of the dashboard (390/1024/1440 px, collapsed rail and
  drawer) plus the other pages.

### Deployment verification (Router)

- Pulled `74f229e` into `/opt/website/LiuLianBot`; the local `start.sh` mode
  change (100755) was preserved, and PM2 `liulianbot-website` restarted cleanly.
- `/login.html`, `/share.html` and `/css/style.css` answer 200; `/index.html` and
  `/files.html` still redirect to the login page without a session.
- The deployed pages reference `style.css?v=20260917-ui3`, the new
  `/assets/main-D7qD83zy.js` bundle answers 200, the previous bundle is gone, and
  the deployed `style.css` (`a8281c38…`) and bundle (`554ef974…`) match the
  committed copies by SHA-256. The served CSS contains the new `app-shell`,
  `navbar.sidebar`, `stat-card` and `data-table` rules.
- Opened the live login page through an SSH tunnel to confirm the deployed build
  renders. The signed-in dashboard needs credentials, so it was verified through
  the byte-identical bundle and CSS instead.

## Since `6f6e233`

- Rebuilt the website UI on one shared design system, replacing the old purple
  theme and the separate teal styling the remote pages had grown. The brand blue
  (`#1c6ba0`, also the PWA theme colour) now leads, with teal `#66d9c5` as the
  secondary accent.
- Rewrote `frontend/static/css/style.css` around tokens: navy surface scale,
  `--radius`/`--shadow`/`--ring` primitives, and consistent buttons, inputs,
  tabs, tables, badges, modals, toasts, empty states and focus rings.
- Rebuilt the navigation as a sticky, translucent top bar with a brand mark,
  grouped `Workspaces` (Remote, Chromium, VLESS), `Websites` and `Manage`
  (Discord servers, Admin) menus, plus a `Menu` drawer under 1080px. Added a
  skip link and `#main-content` landmarks across every page.
- Page visibility and `remoteAvailable` filtering still apply inside the grouped
  menus, and `/api/connections` is still fetched once, when `Websites` first
  opens.
- Dashboard now opens with a hero (greeting, description, primary actions) above
  the tool cards; cards gained icon tiles, hover lift and an arrow affordance.
- Login is a two-column screen: brand copy on the left, the unchanged
  login/register card (same tab semantics and element ids) on the right.
- Remote/WebRDP, SSH, Chromium, VLESS and the FnOS file pages now share the same
  tokens and component styles; the Chromium address bar and file inputs use the
  dark inset treatment.
- Rewrote `frontend/static/css/files.css` against the shared tokens instead of
  its own hard-coded grey-blue palette.
- Bumped the stylesheet version query in `frontend/*.html` to `?v=20260917-ui2`.
- Rebuilt the committed `website-part/public` bundle and updated
  `test/frontend/nav.test.mjs` to cover the grouped menus, visibility filtering
  inside them, and the single-open-menu behaviour.
- Updated both READMEs (design-system section plus the new `Manage > Discord
  servers` navigation path) and `.gitignore` (symlinked `node_modules` installs
  and browser crash dumps).
- Verified with `npm run check` (syntax checks, Vite build, 251 tests) and local
  Chromium screenshots of all 13 pages at 390/1024/1280/1440 px. The Router
  deployment has not been re-checked visually yet.

### Deployment verification (Router)

- Pulled `6c75c63` and `049516e` into `/opt/website/LiuLianBot`; the local
  `website-part/start.sh` modification is mode-only (100755) and was preserved.
- Restarted PM2 `liulianbot-website` (127.0.0.1:30011). The process returned
  online and its log shows one clean shutdown/start pair with no errors.
- `/login.html`, `/share.html`, `/terms.html` and `/404.html` answer 200, while
  `/index.html`, `/files.html` and `/admin.html` still redirect to the login page
  without a session.
- The served pages reference `style.css?v=20260917-ui2`, the new
  `/assets/main-CY3Dw-ot.js` bundle answers 200 while the previous bundle is gone,
  and the deployed `style.css` and bundle match the committed copies by SHA-256.
- Opened the live login page through an SSH tunnel at 1280 px and 390 px to
  confirm the redesigned layout renders on the deployed build.

## Since `d17e122`

- Added the FnOS file browser and sharing feature, confined to `/vol*/1000` over SFTP.
- Ported its front end onto the React rewrite: `frontend/files.html` and
  `frontend/share.html` mount the shared bundle, with `FilesPage.jsx`,
  `SharePage.jsx`, `lib/filesApi.mjs`, and `static/css/files.css`.
- Supports volume and folder navigation, per-folder filtering, streamed downloads,
  uploads (1 GiB limit, exclusive create), folder creation, same-volume rename and
  deletion of files or empty folders.
- Pins `FILES_OWNER_USER_ID` as the file owner, which grants read, write and share
  access to other accounts; the owner panel also approves pending requests.
- Added 1-168 hour share codes stored as SHA-256 hashes, revocable by their creator
  and readable from `/share.html` without signing in.
- Added migration `018` for `website_file_permissions` and `website_file_shares`;
  user ID columns use `VARCHAR(64)` where migration `017` widened them.
- Added migration `019`, which repeats the id widening for databases that had
  already recorded the unreleased file migration as `017` and therefore skipped
  it (the deployed Router database was in exactly that state).
- Rebuilt the committed `website-part/public` bundle, documented the endpoints in
  `docs/API.md`, and refreshed `docs/file-browser.md`, the READMEs and the
  environment table.

### Deployment verification (Router)

- Pulled both commits into `/opt/website/LiuLianBot`, kept the local `start.sh`
  executable bit, and restarted PM2 `liulianbot-website` (127.0.0.1:30011).
- `/login.html` and `/share.html` answer 200, `/files.html` redirects to the login
  page when unauthenticated, `/api/files/access` answers 401 without a session,
  and an unknown share code answers 404.
- Migration `019` widened `website_users.id` and every referencing column to
  `VARCHAR(64)` and restored all 11 foreign keys. A 36 character UUID user insert
  succeeded inside a rolled back transaction, leaving no rows behind.
- SFTP lists `vol1`-`vol7` and reads `vol1`, so the file browser is connected.

## Since `d921fe3ab06e76f7940726d55994ace22afe53aa`

- Rewrote the website frontend as a React application built with Vite.
- Kept every guarded page URL (`/login.html`, `/roller.html`, `/admin.html`, ...)
  and the Express authorization, session, and page-visibility behaviour unchanged.
- Replaced the vanilla browser modules with React pages, shared components
  (navigation, tabs, modal, toasts), and hooks (auth, page visibility, busy state).
- Retained the framework-independent browser libraries: API client, auth store,
  focus-trapping dialog controller, Chromium screencast session, and the RDP
  client/input/bitmap modules.
- Moved CSS, icons, manifest, and vendored Socket.IO/RDP decoder assets to the Vite
  public directory; the build output is committed under `website-part/public`.
- Ported the frontend test suite to React component tests running on `node:test`
  with jsdom, plus an esbuild JSX loader for `.jsx` sources and JSX test files.
- Added a CI guard that rebuilds the bundle and fails when `website-part/public` is
  stale.

### Follow-up: registration failed on databases created by these migrations

- Registration returned `500 / INTERNAL_ERROR` with
  `ER_DATA_TOO_LONG: Data too long for column 'id'`.
- Migration 001 declared `website_users.id` (and every referencing
  `user_id`/`created_by` column) as `VARCHAR(30)`, while the application
  generates `crypto.randomUUID()` ids of 36 characters, so no account could be
  created on a fresh database.
- Migration 017 widens those columns to `VARCHAR(64)`. Because InnoDB refuses to
  change a column that a foreign key still uses, it reads the referencing keys
  (with their delete/update rules) from `information_schema`, drops them, widens
  the columns, then recreates the same foreign keys. Columns that are already
  wide enough are skipped, so the migration is safe to replay.
- Verified against a local MariaDB 10.11 instance: 16 columns became
  `varchar(64)`, all 9 foreign keys were restored, and register → login → page
  and API requests then succeeded. Two migration regression tests were added.

## Since `396b4947a6c58ed6f4f069ec7771af6c4c9525ae`

- Hardened session signing by removing the predictable fallback secret.
- Added fail-closed SSH/RDP host allowlists and DNS/IP destination checks.
- Restricted server-side Chromium navigation, restored Chromium sandboxing, and enforced Chromium page visibility authorization.
- Prevented Terms open redirects and preserved upstream CSP headers.
- Restricted updater repository input and required verified Git commits.
- Added deployment documentation for security-sensitive environment settings.

## Follow-up compatibility fix

- Restored the documented empty allowlist behavior for public SSH/RDP hosts while retaining DNS-resolved private-network blocking.
