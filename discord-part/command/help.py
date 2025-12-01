import discord
from discord.ext import commands

class Help(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.command(name='help')
    async def help_command(self, ctx, command_name: str = None):
        """顯示所有可用的指令或特定指令的詳細資訊"""
        
        if command_name:
            # 顯示特定指令的詳細資訊
            command = self.bot.get_command(command_name)
            if command:
                embed = discord.Embed(
                    title=f"指令: {command.name}",
                    description=command.help or "沒有描述",
                    color=discord.Color.blue()
                )
                if command.aliases:
                    embed.add_field(name="別名", value=", ".join(command.aliases), inline=False)
                embed.add_field(name="用法", value=f"`{ctx.prefix}{command.name} {command.signature}`", inline=False)
                await ctx.send(embed=embed)
            else:
                await ctx.send(f"找不到指令: `{command_name}`")
        else:
            # 顯示所有指令
            embed = discord.Embed(
                title="📚 幫助選單",
                description="以下是所有可用的指令",
                color=discord.Color.blue()
            )
            
            for cog_name, cog in self.bot.cogs.items():
                commands_list = cog.get_commands()
                if commands_list:
                    command_names = [f"`{cmd.name}`" for cmd in commands_list if not cmd.hidden]
                    if command_names:
                        embed.add_field(
                            name=cog_name,
                            value=", ".join(command_names),
                            inline=False
                        )
            
            embed.set_footer(text=f"使用 {ctx.prefix}help <指令名稱> 查看特定指令的詳細資訊")
            await ctx.send(embed=embed)

async def setup(bot):
    await bot.add_cog(Help(bot))