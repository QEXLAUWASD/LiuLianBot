import discord
from command.language_manager import get_translation
import command.commandHandler as cmd_handler

async def help(message, bot):
    """
    顯示所有可用指令或特定指令的詳細資訊。
    用法：>help 或 >help 指令名稱
    """
    args = message.content.split()
    command_prefix = message.content[0] if message.content else '>'
    guild_id = message.guild.id if message.guild else None
    
    if len(args) > 1:
        # 查詢特定指令
        cmd_name = args[1]
        cmd_func = cmd_handler.get_command(cmd_name)
        if cmd_func:
            embed = discord.Embed(
                title=get_translation('help_command_title', guild_id).replace('{command}', cmd_name),
                description=get_translation('help_command_desc', guild_id).replace('{command}', cmd_name),
                color=discord.Color.blue()
            )
            # 這裡可加上 usage 說明
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
        # 列出所有指令
        embed = discord.Embed(
            title=get_translation('help_menu_title', guild_id),
            description=get_translation('help_menu_desc', guild_id),
            color=discord.Color.blue()
        )
        all_cmds = cmd_handler.list_commands()
        for cmd_type, cmds in all_cmds.items():
            if cmds:
                embed.add_field(
                    name=get_translation(f'help_type_{cmd_type}', guild_id),
                    value=", ".join([f"`{c}`" for c in cmds]),
                    inline=False
                )
        embed.set_footer(text=get_translation('help_footer', guild_id).replace('{prefix}', command_prefix))
        await message.channel.send(embed=embed)
