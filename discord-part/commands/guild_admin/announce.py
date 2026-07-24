async def announce(message, bot):
    """在目前頻道或指定頻道發送公告。用法：>announce [#channel] <message>"""
    if message.guild is None:
        return "❌ 此指令只能在伺服器中使用。"
    parts = message.content.split(maxsplit=1)
    if len(parts) < 2:
        return "❌ 用法：`>announce [#channel] <message>`"
    target = message.channel_mentions[0] if getattr(message, "channel_mentions", None) else message.channel
    content = parts[1]
    if message.channel_mentions:
        content = content.replace(message.channel_mentions[0].mention, '', 1).strip()
    if not content or len(content) > 2000:
        return "❌ 公告內容必須為 1-2000 字元。"
    await target.send(content)
    return f"✅ 已在 {target.mention} 發送公告。"
