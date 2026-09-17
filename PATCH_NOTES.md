# Patch notes

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
- Verified with `npm run check` (syntax checks, Vite build, 251 tests) and local
  Chromium screenshots of all 13 pages at 390/1024/1280/1440 px. The Router
  deployment has not been re-checked visually yet.

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
