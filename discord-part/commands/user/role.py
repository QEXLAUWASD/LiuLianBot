from features.self_roles.repository import SelfRoleRepository
from utils.async_io import run_blocking


async def role(message, bot):
    """切換自助身份組。用法：>role <role_id>"""
    if message.guild is None:
        return "❌ 此指令只能在伺服器中使用。"
    parts = message.content.split()
    if len(parts) != 2 or not parts[1].isdigit():
        return "❌ 用法：`>role <role_id>`"
    role_id = int(parts[1])
    configured = await run_blocking(SelfRoleRepository().list_roles, message.guild.id)
    configured_ids = {int(item[0]) for item in configured}
    if role_id not in configured_ids:
        return "❌ 此身份組未開放自助選擇。"
    target = message.guild.get_role(role_id)
    if target is None:
        return "❌ 找不到此身份組。"
    try:
        if target in message.author.roles:
            await message.author.remove_roles(target, reason="Self-role toggle")
            return f"✅ 已移除 {target.mention}。"
        await message.author.add_roles(target, reason="Self-role toggle")
        return f"✅ 已加入 {target.mention}。"
    except Exception:
        return "❌ Bot 缺少管理此身份組的權限。"
