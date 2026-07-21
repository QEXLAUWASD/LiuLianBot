# Slash Interaction Args (best-effort)
此表是從 `commands/**` 靜態分析產出；`source=override` 代表有人工校正。
## guild_admin
| command | options | usage | source |
|---|---|---|---|
| `removeprivatevoice` | (none) | Usage: >removeprivatevoice | heuristic |
| `setlang` | lang:str(required) |  | override |
| `setlogchannel` | channel:text_channel(required) |  | override |
| `setprivatevoice` | channel:voice_channel(optional) | Usage: >setprivatevoice <channel_id or channel_mention> | override |
| `setrollerchannel` | channel:text_channel(required)<br>mode:str(optional choices=['dm', 'channel']) |  | override |
| `setrollermode` | mode:str(required choices=['dm', 'channel']) |  | override |
| `setupvoice` | (none) | 用法: >setupvoice | heuristic |
## guild_owner
| command | options | usage | source |
|---|---|---|---|
| `addguildadmin` | user:user(required) | Usage: >addguildadmin @user or >addguildadmin user_id | override |
| `guildpermissions` | (none) | Usage: >guildpermissions | heuristic |
| `removeguildadmin` | user:user(required) | Usage: >removeguildadmin @user or >removeguildadmin user_id | override |
## owner
| command | options | usage | source |
|---|---|---|---|
| `addadmin` | user:user(required) | Usage: >addadmin @user or >addadmin user_id | override |
| `getinfo` | (none) |  | heuristic |
| `getserverlist` | (none) | Usage: >getserverlist | heuristic |
| `r6update` | (none) | Usage: >r6update | heuristic |
| `removeadmin` | args:str(required) | Usage: >removeadmin @user or >removeadmin user_id | heuristic |
| `update` | (none) | Usage: >update | heuristic |
## user
| command | options | usage | source |
|---|---|---|---|
| `getlang` | (none) |  | heuristic |
| `getr6mapinfo` | map_name:str(required) |  | override |
| `help` | command:str(optional) | 用法：>help 或 >help 指令名稱 | override |
| `listguildadmins` | (none) | 用法: >listguildadmins | heuristic |
| `mypermissions` | (none) | 用法: >mypermissions | heuristic |
| `r6maproll` | (none) |  | heuristic |
| `r6opsroll` | side:str(optional choices=['att', 'def']) |  | override |
| `roller` | target:str(optional choices=['att', 'def', 'map']) |  | override |
| `transfervoice` | user:user(required) | Usage: >transfervoice @user | override |
