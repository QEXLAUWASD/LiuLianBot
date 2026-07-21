from features.r6_roll.randommap import random_map
from command.language_manager import get_translation

import random 

async def r6maproll(message, bot):
	try:
		result = random_map()
	except Exception as exc:  # pragma: no cover - defensive
		return f"Map roll failed: {exc}"

	playlists = ", ".join(result.get("playlists", [])) or "N/A"
	mode = result.get("playlist", "N/A")
	parts = [
		f"{get_translation('r6_map_name', guild_id=message.guild.id if message.guild else None)}: {result.get('name', 'Unknown')}",
		f"{get_translation('r6_map_game_modes', guild_id=message.guild.id if message.guild else None)}: {random.choice(['Bomb', 'Secure Area', 'Hostage'])}",
	]

	return "\n".join(parts)

