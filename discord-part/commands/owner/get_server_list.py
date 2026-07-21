import discord
from commands.language_manager import get_translation


async def getserverlist(message, bot):
    """Get a list of all servers the bot is in.
    
    Usage: >getserverlist
    """
    guilds = bot.guilds

    gid = message.guild.id if message.guild else None

    if not guilds:
        return get_translation('serverlist_no_servers', gid)
    
    # Create embed for better presentation
    embed = discord.Embed(
        title=get_translation('serverlist_title', gid).replace('{count}', str(len(guilds))),
        color=discord.Color.blue()
    )
    
    server_list = []
    for guild in guilds:
        owner = guild.owner if guild.owner else "Unknown"
        server_list.append(
            get_translation('server_entry_format', gid)
                .replace('{name}', guild.name)
                .replace('{id}', str(guild.id))
                .replace('{members}', str(guild.member_count))
                .replace('{owner}', str(owner))
        )
    
    # Split into chunks if too many servers
    if len(guilds) > 10:
        # Send in multiple embeds if more than 10 servers
        chunks = [server_list[i:i+10] for i in range(0, len(server_list), 10)]
        embeds = []
        for i, chunk in enumerate(chunks, 1):
            chunk_embed = discord.Embed(
                    title=get_translation('serverlist_page_title', gid).replace('{count}', str(len(guilds))).replace('{page}', str(i)).replace('{pages}', str(len(chunks))),
                    description="\n\n".join(chunk),
                    color=discord.Color.blue()
                )
            embeds.append(chunk_embed)
        
        # Send first embed as return, others directly
        if embeds:
            for embed in embeds[1:]:
                await message.channel.send(embed=embed)
            return embeds[0]
    else:
        embed.description = "\n\n".join(server_list)
        return embed