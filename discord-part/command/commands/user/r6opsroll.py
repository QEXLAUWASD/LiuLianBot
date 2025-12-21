from fuction.r6Roll.randomops import random_operator
from command.language_manager import get_translation

async def r6opsroll(message, bot):
	parts = message.content.split()
	side_arg = parts[1] if len(parts) > 1 else None

	try:
		result = random_operator(side_arg)
	except Exception as exc:  # pragma: no cover - defensive
		return f"Roll failed: {exc}"

	side_label = "Attacker" if result.get("side") == "Att" else "Defender"
	lines = [
		f"🎲 {side_label}: {result.get('name', 'Unknown')}",
		f"{get_translation('r6_Primary_Weapon', guild_id=message.guild.id if message.guild else None)}: {result.get('primary', 'N/A')}",
		f"{get_translation('r6_Secondary_Weapon', guild_id=message.guild.id if message.guild else None)}: {result.get('secondary', 'N/A')}",
		f"{get_translation('r6_Gadget', guild_id=message.guild.id if message.guild else None)}: {result.get('gadget', 'N/A')}",
	]
	
	return "\n".join(lines)