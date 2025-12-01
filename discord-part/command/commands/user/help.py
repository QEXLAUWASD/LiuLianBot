import discord
import inspect
from command.language_manager import get_translation
import command.commandHandler

async def help(message, bot):
    """
    顯示所有可用指令或特定指令的詳細資訊。
    用法：>help 或 >help 指令名稱
    """
    # Get handler instance
    cmd_handler = command.commandHandler.handler
    
    args = message.content.split()
    # try to detect prefix, fallback to '>' when unsure
    command_prefix = message.content[0] if message.content and (not message.content[0].isalnum()) else '>'
    guild_id = message.guild.id if message.guild else None

    if len(args) > 1:
        # 查詢特定指令
        cmd_name = args[1]
        cmd_func = cmd_handler.get_command(cmd_name)
        if cmd_func:
            # Try to get command description from function docstring or locale
            desc = inspect.getdoc(cmd_func) or get_translation(f'cmd_desc_{cmd_name}', guild_id)
            embed = discord.Embed(
                title=get_translation('help_command_title', guild_id).replace('{command}', cmd_name),
                description=desc or get_translation('help_command_desc', guild_id).replace('{command}', cmd_name),
                color=discord.Color.blue()
            )
            embed.add_field(
                name=get_translation('help_usage_field', guild_id),
                value=f"`{command_prefix}{cmd_name}`",
                inline=False
            )
            embed.set_footer(text=get_translation('help_footer', guild_id).replace('{prefix}', command_prefix))
            await message.channel.send(embed=embed)
        else:
            await message.channel.send(get_translation('cmd_not_found', guild_id).replace('{command}', cmd_name))
    else:
        # 列出所有指令，依權限分組
        embed = discord.Embed(
            title=get_translation('help_menu_title', guild_id),
            description=get_translation('help_menu_desc', guild_id),
            color=discord.Color.blue()
        )
        all_cmds = cmd_handler.list_commands()
        # 分組：owner, admin, guild_admin, guild_owner, user
        type_map = {
            'owner': [],
            'admin': [],
            'guild_admin': [],
            'guild_owner': [],
            'user': []
        }
        for cmd in all_cmds:
            ctype = cmd_handler.command_types.get(cmd, 'user')
            if ctype in type_map:
                type_map[ctype].append(cmd)
        for ctype, cmds in type_map.items():
            if cmds:
                # For each command, try to include a short one-line description
                lines = []
                for c in sorted(cmds):
                    func = cmd_handler.get_command(c)
                    short = None
                    if func:
                        doc = inspect.getdoc(func)
                        if doc:
                            short = doc.splitlines()[0]
                    if not short:
                        short = get_translation(f'cmd_desc_{c}', guild_id)
                        if short == f'cmd_desc_{c}':
                            short = ''
                    lines.append(f"`{c}` {('- ' + short) if short else ''}")

                embed.add_field(
                    name=get_translation(f'help_type_{ctype}', guild_id),
                    value="\n".join(lines),
                    inline=False
                )
        embed.set_footer(text=get_translation('help_footer', guild_id).replace('{prefix}', command_prefix))
        await message.channel.send(embed=embed)
