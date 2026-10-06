# LiuLianBot

此倉庫保留 Discord Bot 與 Android App。網站已移至 [QEXLAUWASD/LiuLianWEB](https://github.com/QEXLAUWASD/LiuLianWEB)，網站部署、前端與 API 文件請參閱新倉庫。需要 Python 3.11+ 與 MySQL 8+。

### Discord bot

- Rainbow Six Siege map, operator, and map-information commands
- Configurable roller channels with role-based random selection
- Temporary private voice channels with ownership transfer and automatic cleanup
- Guild event logging for messages, voice states, members, channels, roles, and guild changes
- Audit-log actor attribution for administrative changes: channel/role create, update, and delete; member role changes, kicks, bans, and unbans; and server setting edits; forced voice-channel moves (`member_move`). The bot also performs an unfiltered recent-entry fallback for member moves because some discord.py versions ignore that action filter.
- Per-guild language selection for English and Traditional Chinese (`zh_TW`)
- Hierarchical permissions for bot owners, bot admins, guild owners, guild admins, and users
- Prefix commands and automatically registered slash commands backed by the same handlers
- Git-based updater for pulling a configured repository branch

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
event embed.
Channel updates also check permission-overwrite audit actions, because Discord
records permission changes separately from normal channel updates. The bot requires the **View Audit Log** permission; if Discord
does not return a matching entry yet, the bot retries for about five seconds before logging
the event with an `Unknown` actor instead of dropping it. Grant this permission
to the bot's role, not only to the administrator performing the change.
If the audit lookup raises an unexpected error, the bot console log includes the
guild ID and Python exception details for diagnosis.
The lookup accepts Discord action enums, documented names (for example,
`channel_update`), numeric values or numeric strings such as `10`, `11`, and `12`,
and compatible enum objects that expose an integer `value`. Any non-negative
numeric action value is passed through, even when the deployed discord.py version
does not define that newer action yet.

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
order. The website migration also maintains the guild-channel type column used
by the dashboard's private-voice trigger selector.

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


## Integration and checks

Both repositories need their own shared/database/config.json pointing to the same database. Initialize LiuLianWEB first on a fresh database, then start the bot.

```bash
python -m pip install -r discord-part/requirements-dev.txt
python -m pytest -q
python -m ruff check discord-part shared
python -m compileall -q discord-part shared
```

Android setup: [android-part/README.md](android-part/README.md). Never commit bot tokens or database credentials.

## License

This project is for personal and community use. All rights reserved.
