from features.self_roles.repository import SelfRoleRepository
from utils.async_io import run_blocking


async def setselfrole(message, bot):
    """將身份組加入自助選擇清單。用法：>setselfrole @role"""
    if message.guild is None:
        return "❌ 此指令只能在伺服器中使用。"
    role = message.role_mentions[0] if getattr(message, "role_mentions", None) else None
    if role is None:
        return "❌ 用法：`>setselfrole @role`"
    if role.is_default() or role.managed:
        return "❌ 此身份組不可供成員自助選擇。"
    await run_blocking(SelfRoleRepository().add_role, message.guild.id, role.id, role.name)
    return f"✅ 已將 {role.mention} 加入自助身份組。"
