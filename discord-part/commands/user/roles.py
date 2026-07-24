from features.self_roles.repository import SelfRoleRepository
from utils.async_io import run_blocking


async def roles(message, bot):
    """列出本伺服器可自助選擇的身份組。"""
    if message.guild is None:
        return "❌ 此指令只能在伺服器中使用。"
    configured = await run_blocking(SelfRoleRepository().list_roles, message.guild.id)
    if not configured:
        return "目前沒有可自助選擇的身份組。"
    return "可選身份組：\n" + "\n".join(f"`{role_id}` {name}" for role_id, name in configured)
