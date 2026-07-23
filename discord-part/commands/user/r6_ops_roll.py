from features.r6_roll.randomops import random_operator
from commands.language_manager import get_translation
from utils.error_reporting import report_exception

async def r6opsroll(message, bot):
	parts = message.content.split()
	side_arg = parts[1] if len(parts) > 1 else None

	try:
		result = random_operator(side_arg)
	except Exception:  # pragma: no cover - defensive
		return report_exception(bot.logger, "r6opsroll", "Roll failed")

	side_label = "Attacker" if result.get("side") == "Att" else "Defender"
	lines = [
		f"🎲 {side_label}: {result.get('name', 'Unknown')}",
		f"{get_translation('r6_Primary_Weapon', guild_id=message.guild.id if message.guild else None)}: {result.get('primary', 'N/A')}",
		f"{get_translation('r6_Secondary_Weapon', guild_id=message.guild.id if message.guild else None)}: {result.get('secondary', 'N/A')}",
		f"{get_translation('r6_Gadget', guild_id=message.guild.id if message.guild else None)}: {result.get('gadget', 'N/A')}",
	]
	
	return "\n".join(lines)
