# 🎮 LiuLianBot

A feature-rich Discord bot built with [discord.py](https://github.com/Rapptz/discord.py), designed for gaming communities with Rainbow Six Siege integration, private voice channels, comprehensive server logging, and multi-language support.

---

## ✨ Features

### 🎯 Rainbow Six Siege Tools
- **Random Map Roll** — Randomly picks a Rainbow Six Siege map with playlist info
- **Random Operator Roll** — Randomly selects an operator (Attack/Defense/All)
- **Map Info Lookup** — View details about specific maps

### 🔊 Private Voice Channels
- Users can create their own temporary voice channels
- Full control over channel name, user limit, and permissions
- Automatic cleanup of empty channels
- Voice channel ownership transfer

### 📋 Server Logging
Comprehensive event logging to a designated channel:
- Message edits, deletions, and bulk deletions
- Voice state changes (join, leave, move, mute, deafen)
- Member joins, leaves, updates, bans, and unbans
- Channel creation, deletion, and updates
- Role creation, deletion, and updates
- Guild updates

### 🎲 Roller System
- Configurable roll channels with custom modes
- Role-based random selection for team picking

### 🌐 Website Dashboard
- Web-based R6 roller interface accessible from a browser
- User authentication system with login/registration
- Admin panel for bot and user management
- SQL injection protection and session-based security

### 🔄 Auto-Updater
- Pull latest code from a GitHub repository via bot command
- Support for both public and private repositories
- Automatic bot restart after update (configurable)

### 🌐 Multi-Language Support
- **English** (`en`)
- **繁體中文** (`zh_TW`)
- Per-guild language settings

### 🔐 Permission System
Hierarchical permission model:
| Level | Description |
|-------|-------------|
| **Bot Owner** | Full access to all commands |
| **Bot Admin** | Administrative commands across all guilds |
| **Guild Owner** | Manage guild admins and guild permissions |
| **Guild Admin** | Configure guild-specific settings |

---

## 📁 Project Structure

```
LiuLianBot/
├── start.sh                     # Linux bot manager
├── discord-part/
│   ├── main.py                  # Bot entry point
│   ├── default_config.json      # Configuration template
│   ├── requirements.txt         # Python dependencies
│   ├── commands/
│   │   ├── handler.py           # Command discovery and routing
│   │   ├── language_manager.py  # Translation service
│   │   ├── permission_checker.py
│   │   ├── roller_service.py
│   │   ├── user/
│   │   ├── guild_admin/
│   │   ├── guild_owner/
│   │   └── owner/
│   ├── core/                    # Bot lifecycle and configuration
│   ├── features/                # Discord event features
│   ├── locales/                 # Translation resources
│   ├── tools/                   # Development utilities
│   ├── updater/                 # Git-based updater
│   └── utils/                   # Database and logging helpers
├── website-part/
│   ├── package.json
│   ├── public/                  # Static HTML, CSS, and browser JS
│   └── src/
│       ├── server.js            # Express entry point
│       ├── db.js                # Database compatibility facade
│       ├── db/                  # Domain repositories and migrations
│       ├── middleware/          # Auth and security middleware
│       └── routes/              # HTTP API routes
├── shared/
│   ├── database/                # Shared database configuration
│   └── r6/                      # R6 data and scraper modules
└── logs/                        # Runtime logs (generated)
```

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.8+**
- **MySQL** / **MariaDB** server
- A Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))

### Linux Installation

```bash
# 1. Clone the repository
git clone https://github.com/QEXLAUWASD/LiuLianBot.git
cd LiuLianBot

# 2. Make the startup script executable
chmod +x start.sh

# 3. Configure the bot
cp discord-part/default_config.json discord-part/config.json
cp shared/database/config.example.json shared/database/config.json
nano discord-part/config.json  # Edit with your settings

# 4. Start the bot
./start.sh
```

### Manual Setup

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r discord-part/requirements.txt

# Run the bot
python discord-part/main.py
```

---

## ⚙️ Configuration

Discord token, prefix, owners, activity, and updater settings live in
`discord-part/config.json`:

```json
{
    "logging_level": "WARNING",
    "prefix": ">",
    "bot_owner": ["YOUR_DISCORD_USER_ID"],
    "bot_admin": ["ADMIN_USER_ID"],
    "activity": {
        "type": "playing",
        "name": "Rainbow Six Siege"
    },
    "token": "YOUR_BOT_TOKEN",
    "updater": {
        "github_repo": "owner/repo",
        "branch": "master",
        "auto_restart": false
    }
}
```

| Setting | Description |
|---------|-------------|
| `logging_level` | Log level: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `prefix` | Command prefix (default: `>`) |
| `bot_owner` | Array of bot owner Discord user IDs |
| `bot_admin` | Array of bot admin Discord user IDs |
| `activity` | Bot's displayed activity status |
| `token` | Your Discord bot token |
| `updater.github_repo` | GitHub repository for auto-updates (`owner/repo`) |
| `updater.branch` | Git branch to track (default: `master`) |
| `updater.auto_restart` | Automatically restart bot after update |

MySQL settings are shared by the Discord bot and website. Create the runtime
file from the safe example, then edit its `mysql` object:

```bash
cp shared/database/config.example.json shared/database/config.json
```

---

## 📝 Commands

### User Commands (prefix: `>`)
| Command | Description |
|---------|-------------|
| `>help` | Show all available commands |
| `>help <command>` | Show help for a specific command |
| `>getlang` | Show current server language |
| `>r6maproll` | Roll a random R6 map |
| `>r6opsroll` | Roll a random R6 operator |
| `>getr6mapinfo <map>` | Get info about a specific map |
| `>roller` | Roll from a configured roller channel |
| `>mypermissions` | Check your permission level |
| `>listguildadmins` | List guild administrators |
| `>transfervoice <@user>` | Transfer voice channel ownership |

### Guild Admin Commands
| Command | Description |
|---------|-------------|
| `>setlang <en/zh_TW>` | Set server language |
| `>setlogchannel <#channel>` | Set logging channel |
| `>setprivatevoice <#channel>` | Set private voice creation channel |
| `>setupvoice` | Setup voice system |
| `>removeprivatevoice` | Remove private voice channel settings |
| `>setrollerchannel <#channel>` | Set roller channel |
| `>setrollermode <mode>` | Set roller mode |

### Guild Owner Commands
| Command | Description |
|---------|-------------|
| `>addguildadmin <@user>` | Add a guild admin |
| `>removeguildadmin <@user>` | Remove a guild admin |
| `>guildpermissions` | View guild permission settings |

### Bot Owner Commands
| Command | Description |
|---------|-------------|
| `>addAdmin <@user>` | Add a bot admin |
| `>removeAdmin <@user>` | Remove a bot admin |
| `>getInfo` | Get bot runtime information |
| `>getServerList` | List all servers the bot is in |
| `>r6update` | Update R6 map & operator data |
| `>update` | Pull latest code from GitHub |

---

## 🌐 Website Setup

The website part provides a browser-based interface for the R6 roller and user management.

```bash
cd website-part

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your session and server settings

# Start the server
npm run start
```

The website runs on `http://localhost:3000` by default.

---

## 🛠️ Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `discord.py` | 2.3.0 | Discord API wrapper |
| `pymysql` | 1.1.2 | MySQL database driver |
| `colorama` | 0.4.6 | Colored terminal output |
| `psutil` | ≥5.9.0 | System resource monitoring |
| `cryptography` | 46.0.3 | Cryptographic operations |
| `requests` | ≥2.31.0 | HTTP requests (R6 data scraping) |
| `beautifulsoup4` | ≥4.12.0 | HTML parsing (R6 data scraping) |

### Website Dependencies (Node.js)

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.18.2 | Web server framework |
| `express-session` | ^1.17.3 | Session management |
| `bcryptjs` | ^2.4.3 | Password hashing |
| `dotenv` | ^16.3.1 | Environment variables |
| `mysql2` | ^3.9.0 | MySQL database driver |
| `http-proxy-middleware` | ^3.0.7 | Authorized website connection proxy |
| `express-rate-limit` | ^7.5.1 | Authentication rate limiting |
| `jsdom` | ^26.1.0 | Frontend DOM tests (development only) |

---

## 📄 License

This project is for personal/community use. All rights reserved.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.
