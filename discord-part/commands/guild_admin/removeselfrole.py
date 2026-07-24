from features.self_roles.repository import SelfRoleRepository
from utils.async_io import run_blocking


async def removeselfrole(message, bot):
    """移除自助身份組。用法：>removeselfrole @role"""
    if message.guild is None:
        return "❌ 此指令只能在伺服器中使用。"
    role = message.role_mentions[0] if getattr(message, "role_mentions", None) else None
    if role is None:
        return "❌ 用法：`>removeselfrole @role`"
    await run_blocking(SelfRoleRepository().remove_role, message.guild.id, role.id)
    return f"✅ 已移除 {role.mention} 的自助選擇。"
