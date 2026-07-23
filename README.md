# LiuLianBot

LiuLianBot is a Discord bot and companion website for gaming communities. It provides Rainbow Six Siege rolls, temporary private voice channels, server logging, configurable rollers, and a web dashboard for account and connection management.

## Features

### Discord bot

- Rainbow Six Siege map, operator, and map-information commands
- Configurable roller channels with role-based random selection
- Temporary private voice channels with ownership transfer and automatic cleanup
- Guild event logging for messages, voice states, members, channels, roles, and guild changes
- Per-guild language selection for English and Traditional Chinese (`zh_TW`)
- Hierarchical permissions for bot owners, bot admins, guild owners, guild admins, and users
- Git-based updater for pulling a configured repository branch

### Website dashboard

- Registration, login, logout, account name changes, password changes, and persistent sessions
- Admin management of users, groups, guild information, and website connections
- Many-to-many group assignments for users and connection access
- Authorized HTTP and WebSocket proxy connections
- Optional hidden connections: hidden from navigation but still available to authorized users by direct URL
- MySQL-backed sessions, authentication rate limiting, and automatic website migrations

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
|   |-- public/                   # HTML, CSS, and browser JavaScript
|   |-- src/                      # App, routes, middleware, repositories, and services
|   `-- test/                     # Node.js test suite
|-- shared/
|   |-- database/                 # Shared MySQL configuration and template
|   `-- r6/                       # Rainbow Six Siege data and scrapers
|-- .github/workflows/            # CI configuration
|-- start.sh                      # Linux bot manager
|-- PRIVACY_POLICY.md
`-- TERMS_OF_SERVICE.md
```

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

On Windows PowerShell:

```powershell
Set-Location website-part
Copy-Item .env.example .env
npm ci
npm start
```

The website listens on `http://localhost:3000` by default. Run its automated tests with:

```bash
npm test
```

## Discord commands

The default prefix is `>`. The command list below reflects the currently registered command handlers; use `>help` in Discord for command-specific usage.

| Access level | Commands |
|---|---|
| User | `>help`, `>getlang`, `>r6maproll`, `>r6opsroll`, `>getr6mapinfo`, `>roller`, `>mypermissions`, `>listguildadmins`, `>transfervoice` |
| Guild admin | `>setlang`, `>setlogchannel`, `>setprivatevoice`, `>setupvoice`, `>removeprivatevoice`, `>setrollerchannel`, `>setrollermode` |
| Guild owner | `>addguildadmin`, `>removeguildadmin`, `>guildpermissions` |
| Bot owner | `>addadmin`, `>removeadmin`, `>getinfo`, `>getserverlist`, `>r6update`, `>update` |

## Security notes

- Do not commit `discord-part/config.json`, `shared/database/config.json`, or `website-part/.env`.
- Use a dedicated MySQL user with only the permissions required by this application.
- Use HTTPS and secure session cookies when deploying the website beyond a trusted local network.
- Only configure connection proxy targets that you trust; authorized users can access their assigned connections through `/connect/<slug>/`.

## Dependencies

The Discord bot dependencies are pinned in `discord-part/requirements.txt`. The website dependencies and lockfile are in `website-part/package.json` and `website-part/package-lock.json`.

Key runtime packages include `discord.py`, `PyMySQL`, `Express`, `express-session`, `express-rate-limit`, `bcryptjs`, `mysql2`, and `http-proxy-middleware`.

## License

This project is for personal and community use. All rights reserved.

## Contributing

Issues and pull requests are welcome. Keep changes scoped to either `discord-part/`, `website-part/`, or `shared/` unless a cross-project change is required.
