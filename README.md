# LiuLianBot

LiuLianBot is a Discord bot and companion website for gaming communities. It provides Rainbow Six Siege rolls, temporary private voice channels, server logging, configurable rollers, events, and a web dashboard for account and connection management.

## Features

### Discord bot

- Rainbow Six Siege map, operator, and map-information commands
- Configurable roller channels with role-based random selection
- Temporary private voice channels with ownership transfer and automatic cleanup
- Guild event logging for messages, voice states, members, channels, roles, and guild changes
- Audit-log actor attribution for administrative changes: channel/role create, update, and delete; member role changes, kicks, bans, and unbans; and server setting edits
- Per-guild language selection for English and Traditional Chinese (`zh_TW`)
- Hierarchical permissions for bot owners, bot admins, guild owners, guild admins, and users
- Prefix commands and automatically registered slash commands backed by the same handlers
- Git-based updater for pulling a configured repository branch

### Website dashboard

- Registration, login, logout, account name changes, password changes, and persistent sessions
- Admin management of users, groups, guild information, and website connections
- Many-to-many group assignments for users and connection access
- Authorized HTTP and WebSocket proxy connections
- Optional hidden connections: hidden from navigation but still available to authorized users by direct URL
- MySQL-backed sessions, authentication rate limiting, and automatic website migrations
- R6 events page for creating events and managing shared signups
- One-time account linking lets Discord commands and website signups use the same identity
- Terms acceptance records consent for website data storage; remote SSH/RDP access can be limited to named user groups
- Browser-based WebRDP desktop sessions powered by mstsc.js and HTML5 Canvas, plus RDP file generation
- SSH terminal and remote profiles, with optional browser-local or AES-256-GCM encrypted server-side connection profiles; WebRDP passwords are session-only
- Built-in Chromium workspace using Puppeteer and Chrome DevTools Protocol screencast
- Admin page-visibility controls for guests, all signed-in users, selected website groups, and selected users

## Project structure

```
LiuLianBot/
|-- discord-part/                 # Python Discord bot
|   |-- main.py                   # Bot entry point
|   |-- default_config.json       # Bot configuration template
|   |-- commands/                 # Prefix-command handlers
|   |-- core/                     # Bot lifecycle, config, and slash adapter
|   |-- features/                 # Discord event features
|   |-- locales/                  # English and Traditional Chinese strings
|   |-- tests/                    # Python test suite
|   |-- updater/                  # Git-based updater
|   `-- utils/                    # Database and logging utilities
|-- website-part/                 # Node.js and Express website
|   |-- public/                   # HTML, CSS, and browser JavaScript (including chromium.html)
|   |-- src/                      # App, routes, middleware, repositories, and services
|   `-- test/                     # Node.js test suite
|-- docs/
|   `-- API.md                    # Website HTTP, WebSocket, and Socket.IO API reference
|-- shared/
|   |-- database/                 # Shared MySQL configuration and template
|   `-- r6/                       # Rainbow Six Siege data and scrapers
|-- .github/workflows/            # CI configuration
|-- start.sh                      # Linux bot manager
|-- PRIVACY_POLICY.md
`-- TERMS_OF_SERVICE.md
```

## Architecture and refactoring boundaries

The repository keeps the Discord bot and website as separate runtimes while
sharing only the MySQL schema and data contract:

- `discord-part/main.py` owns startup ordering: configuration, database
  creation/migrations, then Discord client construction.
- `website-part/src/server.js` owns runtime composition: pool/migrations,
  Express app assembly, WebSocket/SSH attachment, and graceful shutdown.
- `website-part/src/db/` contains domain repositories. `src/db.js` remains a
  compatibility facade for existing imports while new code should import the
  relevant repository directly.
- Discord configuration reads return snapshots; persistent changes go through
  the atomic `update_config` API so handlers cannot silently mutate runtime
  state without writing the configuration file.

The ongoing refactoring direction is compatibility-first: preserve Discord
commands and website URLs/API fields, keep database access behind repositories,
and add tests at each boundary before changing implementation details. The next
larger candidates are dependency injection for repository construction and a
shared service-level error/observability contract; neither is required for
normal deployment today.

## Requirements

- Python 3.10 or later
- Node.js 18 or later with npm
- MySQL or MariaDB
- A Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

## Installation

Clone the repository, then configure the bot and its shared database connection.

```bash
git clone https://github.com/QEXLAUWASD/LiuLianBot.git
cd LiuLianBot
```

### 1. Configure the Discord bot

Create `discord-part/config.json` from the template. Set `token` to the bot token and replace the example Discord user IDs with real IDs.

```bash
cp discord-part/default_config.json discord-part/config.json
```

On Windows PowerShell:

```powershell
Copy-Item discord-part\default_config.json discord-part\config.json
```

Important bot settings:

| Setting | Purpose |
|---|---|
| `token` | Discord bot token |
| `prefix` | Prefix for text commands; defaults to `>` |
| `bot_owner` | Discord user IDs with full bot access |
| `bot_admin` | Discord user IDs with cross-guild administration access |
| `guild_admins` | Optional per-guild administrator IDs |
| `activity` | Displayed Discord activity |
| `updater` | Repository, branch, and restart behavior for `>update` |

#### Administrative audit logging

Configure a log channel with `>setlogchannel all #channel` (or a category such
as `channelaction` or `roleaction`). For administrative events, the bot reads
Discord's Audit Log and adds the responsible user's mention and ID to the
event embed. The bot requires the **View Audit Log** permission; if Discord
does not return a matching entry yet, the bot retries briefly before logging
the event with an `Unknown` actor instead of dropping it. Grant this permission
to the bot's role, not only to the administrator performing the change.
If the audit lookup raises an unexpected error, the bot console log includes the
guild ID and Python exception details for diagnosis.

### 2. Configure the shared database

Both the bot and website read MySQL settings from `shared/database/config.json`. Create it from the tracked template, then replace the example credentials.

```bash
cp shared/database/config.example.json shared/database/config.json
```

On Windows PowerShell:

```powershell
Copy-Item shared\database\config.example.json shared\database\config.json
```

The template contains this structure:

```json
{
  "mysql": {
    "host": "localhost",
    "port": 3306,
    "user": "liulianbot",
    "password": "replace-me",
    "database": "discordbot",
    "charset": "utf8mb4"
  }
}
```

The bot creates the configured database when its MySQL account has permission. The website creates and migrates its required tables when it first connects.
On a fresh database, start the website once before starting the bot: the bot's
announcement migration updates `website_announcements`, which is created by the
website migration. Existing databases with both migration ledgers can start in either
order.

### 3. Install and run the Discord bot

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r discord-part\requirements.txt
.\.venv\Scripts\python.exe discord-part\main.py
```

Linux or macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r discord-part/requirements.txt
python discord-part/main.py
```

On Linux, `./start.sh` can also manage the bot process after it is made executable with `chmod +x start.sh`.

### 4. Install and run the website

Create the website environment file from its template. Set a strong, unique `SESSION_SECRET` outside local development.

```bash
cd website-part
cp .env.example .env
npm ci
npm start
```

For local development, `npm run dev` uses the same server entry point. The website
binds to `127.0.0.1:3000` by default.

When updating an existing PM2 deployment after a dependency change, reinstall the
production dependencies before restarting the process:

```bash
cd /opt/website/LiuLianBot/website-part
npm ci --omit=dev
npm ls socket.io @electerm/rdpjs --depth=0
pm2 restart liulianb --update-env
```

The `npm ls` command should show both packages. A `MODULE_NOT_FOUND` error from
`src/rdp_socket.js` means this dependency installation step has not completed on
the deployment host.

If the remote page reports that WebRDP client assets failed to load, verify the
three static files from the deployed site. Each request must return `200`:

```bash
curl -I https://your-domain.example/vendor/socket.io.min.js
curl -I https://your-domain.example/vendor/webrdp/rle.js
curl -I https://your-domain.example/vendor/webrdp/webrdp.js
```

For a Linux production deployment managed by PM2:

```bash
cd website-part
./start.sh init
./start.sh start
```

Run `./start.sh init` again after changing production dependencies or the PM2
definition. Put an HTTPS reverse proxy in front of the website for production.
The MySQL session cleanup job logs transient cleanup failures without disabling
new login sessions. After deploying session-store changes, restart the PM2 app
with `./start.sh restart`.

### Run the website with Docker CLI

The following image contains only `website-part/` and its production Node.js
dependencies. It does not build or run `discord-part/`, and it reads the shared
database configuration from a read-only runtime mount.

First create `website-part/.env` and `shared/database/config.json` as described
above. Set `SESSION_SECRET` in `.env` to a strong, unique value. Build from the
repository root so Docker can include the website and the shared database mount
path:

```bash
docker build --file website-part/Dockerfile --tag liulianbot-website:latest .
```

Run the website container. `BIND_IP=0.0.0.0` exposes the application to Docker's
port forwarding; put an HTTPS reverse proxy in front of it for production.

```bash
docker run --detach --name liulianbot-website \
  --restart unless-stopped \
  --publish 3000:3000 \
  --env-file website-part/.env \
  --env BIND_IP=0.0.0.0 \
  --volume "$(pwd)/shared/database/config.json:/app/shared/database/config.json:ro" \
  liulianbot-website:latest
```

On Windows PowerShell, use `${PWD}` for the database configuration mount:

```powershell
docker run --detach --name liulianbot-website `
  --restart unless-stopped `
  --publish 3000:3000 `
  --env-file website-part/.env `
  --env BIND_IP=0.0.0.0 `
  --volume "${PWD}/shared/database/config.json:/app/shared/database/config.json:ro" `
  liulianbot-website:latest
```

View container logs with `docker logs --follow liulianbot-website`. After a
website code or dependency update, rebuild the image and replace the container:

```bash
docker build --file website-part/Dockerfile --tag liulianbot-website:latest .
docker rm --force liulianbot-website
# Run the docker run command above again.
```

### Website environment variables

The website reads MySQL settings from `shared/database/config.json`; the remaining
runtime settings are read from `website-part/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` for deployment; production requires `SESSION_SECRET` and secure cookies. |
| `PORT` | `3000` | HTTP listen port. |
| `BIND_IP` | `127.0.0.1` | Listen address. Keep the default behind a local reverse proxy. |
| `SESSION_COOKIE_NAME` | `connect.sid` | Session cookie name. |
| `SESSION_SECRET` | Development fallback only | Long, random secret used to sign sessions; mandatory in production. |
| `TERMS_OF_SERVICE_REQUIRED` | `true` | Set to `false` only when the hoster does not require explicit Terms of Service and data-storage consent. |
| `PROXY_ALLOW_SELF_SIGNED` | `false` | Set to `true` only when an upstream website intentionally uses a self-signed certificate. |
| `REMOTE_ALLOWED_GROUPS` | `admin` | Website groups allowed to use the SSH/RDP page and APIs. |
| `REMOTE_SSH_ENABLED` | `true` | Set to `false` to disable SSH for all users, including administrators. |
| `REMOTE_RDP_ENABLED` | `true` | Set to `false` to disable RDP for all users, including administrators. |
| `SSH_ALLOWED_HOSTS` | Empty | Optional comma-separated SSH hostnames, IPv4 addresses, or IPv4 CIDR ranges. Empty allows any reachable host. |
| `REMOTE_CREDENTIAL_ENCRYPTION_KEY` | Empty | Base64-encoded 32-byte AES-256-GCM key for server-side SSH/RDP profile storage. |
| `CHROME_EXECUTABLE_PATH` | Empty | Optional path to the Chrome/Chromium executable when it is not available on `PATH`. |
| `CHROME_CDP_URL` | Empty | Optional remote Chrome DevTools endpoint, such as `http://192.168.1.10:9222`; when set, the website connects to that Chrome instead of launching one locally. |
| `CHROMIUM_SESSION_TIMEOUT_MS` | `1800000` | Maximum lifetime of one Chromium WebSocket session in milliseconds. |

### Remote client configuration

The remote page is disabled for users outside `REMOTE_ALLOWED_GROUPS` (defaults to `admin`). Configure allowed website user groups and, on untrusted networks, restrict the SSH hosts that the server may reach:

```env
REMOTE_ALLOWED_GROUPS=admin,server-operator
SSH_ALLOWED_HOSTS=server.example.com,192.168.1.0/24
```

To enable encrypted server-side storage for SSH host details/private keys and RDP connection details, generate and securely retain a 32-byte key. SSH passwords are never stored.

```bash
openssl rand -base64 32
```

Set the resulting value in `website-part/.env`:

```env
REMOTE_CREDENTIAL_ENCRYPTION_KEY=<generated-base64-key>
```

Do not change or lose this key while encrypted profiles exist, or those profiles cannot be decrypted. If it is omitted, users can still use browser-local storage but server-side profile storage is disabled.

On Windows PowerShell:

```powershell
Set-Location website-part
Copy-Item .env.example .env
npm ci
npm start
```

The website listens on `http://127.0.0.1:3000` by default. Run its automated tests with:

```bash
npm test
```

## Discord commands

The default prefix is `>`. Prefix commands and slash commands share the same handlers.
Slash command options are generated from `discord-part/tools/interaction_args.json`;
when adding a command with arguments, update that metadata as well. Use `>help` or the
Discord command picker for command-specific usage.

| Access level | Commands |
|---|---|
| User | `>help`, `>getlang`, `>r6maproll`, `>r6opsroll`, `>getr6mapinfo`, `>roller`, `>roles`, `>role`, `>mypermissions`, `>listguildadmins`, `>transfervoice`, `>link`, `>events`, `>eventjoin`, `>eventleave`, `>eventteams` |
| Guild admin | `>setlang`, `>setlogchannel`, `>setprivatevoice`, `>setupvoice`, `>removeprivatevoice`, `>setrollerchannel`, `>setrollermode`, `>setselfrole`, `>removeselfrole`, `>announce` |
| Guild owner | `>addguildadmin`, `>removeguildadmin`, `>guildpermissions` |
| Bot owner | `>addadmin`, `>removeadmin`, `>getinfo`, `>getserverlist`, `>r6update`, `>update` |

### Server manager and categorized logs

Link the website account from **Account** with `>link <code>`, then open **Discord Manager**. The page only exposes servers where the linked Discord account is the server owner, a configured guild administrator, or a configured bot administrator. It can change the bot language and select a fallback `all` log channel plus per-category overrides.

Guild administrators can set the same log routing in Discord:
`/setlogchannel <all|useraction|voiceaction|groupaction|messageaction|channelaction|roleaction> <channel>`.
The `all` channel is the fallback for every event; a category-specific channel overrides it for that category.

### R6 events

1. Log in to the website, open Account, and generate a Discord link code.
2. Run `>link <code>` in Discord. The code expires after 10 minutes and is single-use.
3. Open Events on the website and create an event with the Discord server ID, start time, and capacity.
4. Use `>events` to list events, then `>eventjoin <event_id>` or `>eventleave <event_id>` to manage signup.
5. Use `>eventteams <event_id>` to generate two balanced teams from the signup order.

Discord must be linked before creating an event. The website and bot share the same MySQL participant records. Members can use `>roles` and `>role <role_id>` for configured self-assignable roles; administrators can use the Admin Announcements tab for scheduled notices.

## Website pages and routes

The public pages are `login.html`, `terms.html`, `roller.html`, and `404.html`.
Authenticated users can access `index.html`, `account.html`, `events.html`,
`remote.html`, `chromium.html`, and `guild-manager.html`; administrators additionally have `admin.html`.

The website exposes JSON APIs under `/api` for authentication, account and Discord
link management, R6 rolls, events, website connections, administration, remote
profiles, and RDP file generation. The authenticated `remote.html` page also
provides an in-browser WebRDP workspace using the mstsc.js Canvas/RLE client and a
Socket.IO bridge backed by `@electerm/rdpjs`. Authorized HTTP/WebSocket website
connections are available under `/connect/<slug>/`. SSH uses the `/api/ssh`
WebSocket endpoint.

See [`docs/API.md`](docs/API.md) for the endpoint inventory, request fields,
authorization rules, error behavior, and WebSocket/Socket.IO message protocols.

### Page visibility

Administrators can open Admin > Page Visibility to control which website subpages appear in navigation and dashboard links. Each page can be shown to non-logged-in visitors, all signed-in users, selected website groups, or selected users. The settings are also checked by the page routes; existing feature-specific requirements such as Remote access permissions still apply.

### Chromium workspace

The Chromium page uses Puppeteer with Chrome DevTools Protocol (CDP) screencasting. The website server launches a headless Chrome/Chromium process, sends JPEG screencast frames over an authenticated WebSocket, and forwards browser input events back through CDP. Install Chrome or Chromium on the server; set `CHROME_EXECUTABLE_PATH` when the executable is not on `PATH`. On OpenWrt, where Chromium may not be available in the configured feed, set `CHROME_CDP_URL` to a Chrome DevTools endpoint on another machine instead. Each connected user owns a browser page that is closed when the WebSocket ends or its timeout is reached. Administrators can still use Admin > Page Visibility to decide which users or groups can see the Chromium page.

## Development checks

Install the development dependencies, then run the same checks used by CI:

```bash
# Discord bot
python -m pip install -r discord-part/requirements-dev.txt
python -m pytest -q
python -m ruff check discord-part shared
python -m compileall -q discord-part shared

# Website
cd website-part
npm ci
npm run check
```

`npm run check` parses browser JavaScript and runs the complete Node.js test suite.
The Node.js tests inject database fakes where needed, so they do not require a
live MySQL server or start the production server.

Run the Ruff command from the repository root so both the Discord bot and shared
Python modules are checked together:

```bash
python -m ruff check discord-part shared
```

The website validates `PORT` before binding and closes its MySQL pool during a
graceful `SIGINT` or `SIGTERM` shutdown.

## Security notes

- Do not commit `discord-part/config.json`, `shared/database/config.json`, or `website-part/.env`.
- Use a dedicated MySQL user with only the permissions required by this application.
- Use HTTPS and secure session cookies when deploying the website beyond a trusted local network.
- Only configure connection proxy targets that you trust; authorized users can access their assigned connections through `/connect/<slug>/`.
- Restrict `SSH_ALLOWED_HOSTS` in production. It accepts host names, IPv4 addresses, and IPv4 CIDR ranges such as `192.168.1.0/24`; an empty value permits any host reachable from the website server.
- Set `REMOTE_SSH_ENABLED=false` or `REMOTE_RDP_ENABLED=false` to disable that remote feature globally, including for administrators.
- Remote access requires both accepted website terms and membership in one of the groups listed in `REMOTE_ALLOWED_GROUPS`.
- Browser-local remote profiles use `localStorage`; do not use browser storage on shared or untrusted devices.
- WebRDP passwords are sent only for the active Socket.IO connection and are not included in saved profiles.
- Keep `REMOTE_CREDENTIAL_ENCRYPTION_KEY` outside source control and back it up securely; it protects stored SSH private keys and RDP connection details.

## Dependencies

The Discord bot dependencies are pinned in `discord-part/requirements.txt`. The website dependencies and lockfile are in `website-part/package.json` and `website-part/package-lock.json`.

Key runtime packages include `discord.py`, `PyMySQL`, `Express`, `express-session`, `express-rate-limit`, `bcryptjs`, `mysql2`, `http-proxy-middleware`, `ssh2`, `ws`, `socket.io`, and `@electerm/rdpjs`.

## License

This project is for personal and community use. All rights reserved.

## Contributing

Issues and pull requests are welcome. Keep changes scoped to either `discord-part/`, `website-part/`, or `shared/` unless a cross-project change is required.
