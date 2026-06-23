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
├── start.sh                  # Linux startup script
├── discord-part/
│   ├── main.py               # Bot entry point
│   ├── config.json           # Bot configuration
│   ├── default_config.json   # Default config template
│   ├── requirements.txt      # Python dependencies
│   ├── command/
│   │   ├── commandHandler.py # Command loading & routing
│   │   ├── language_manager.py
│   │   ├── permission_checker.py
│   │   ├── roller_service.py
│   │   └── commands/
│   │       ├── user/         # Public commands
│   │       ├── guild_admin/  # Guild admin commands
│   │       ├── guild_owner/  # Guild owner commands
│   │       └── owner/        # Bot owner commands
│   ├── fuction/
│   │   ├── r6Roll/           # R6 map & operator randomizer
│   │   ├── private_voiceChat/# Private voice channel system
│   │   ├── server_logger/    # Event logging system
│   │   ├── messagelogger/    # Message log helpers
│   │   └── userLogger/       # User event log helpers
│   ├── locales/
│   │   ├── en.json           # English translations
│   │   └── zh_TW.json        # Traditional Chinese translations
│   ├── tools/                # Dev utilities
│   └── uilts/
│       ├── database.py       # MySQL database connection
│       └── logger.py         # Logging setup
└── logs/                     # Runtime logs
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

Edit `discord-part/config.json`:

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
    "mysql_config": {
        "host": "localhost",
        "user": "root",
        "password": "your_password",
        "database": "discordbot",
        "charset": "utf8mb4"
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
| `mysql_config` | MySQL database connection settings |

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

---

## 🛠️ Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `discord.py` | 2.3.0 | Discord API wrapper |
| `pymysql` | 1.1.2 | MySQL database driver |
| `colorama` | 0.4.6 | Colored terminal output |
| `psutil` | ≥5.9.0 | System resource monitoring |
| `cryptography` | 46.0.3 | Cryptographic operations |

---

## 📄 License

This project is for personal/community use. All rights reserved.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.
