from features.events.repository import EventRepository


async def link(message, bot):
    """將網站帳戶連結至目前 Discord 使用者。用法：>link <code>"""
    parts = message.content.split()
    if len(parts) != 2:
        return "❌ 用法：`>link <code>`，請先在網站 Account 頁面產生代碼。"
    try:
        linked = await __import__("utils.async_io", fromlist=["run_blocking"]).run_blocking(
            EventRepository().link_account, parts[1], message.author.id
        )
    except ValueError as exc:
        if str(exc) == "already_linked":
            return "❌ 此 Discord 帳戶已連結至另一個網站帳戶。"
        raise
    return "✅ Discord 帳戶已連結。" if linked else "❌ 代碼無效或已過期。"
