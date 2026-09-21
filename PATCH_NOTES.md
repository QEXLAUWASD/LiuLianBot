# Patch notes

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
