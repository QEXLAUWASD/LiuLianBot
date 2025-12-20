from fuction.r6Roll.randommap import random_map

import random 

async def r6maproll(message, bot):
	try:
		result = random_map()
	except Exception as exc:  # pragma: no cover - defensive
		return f"Map roll failed: {exc}"

	playlists = ", ".join(result.get("playlists", [])) or "N/A"
	mode = result.get("playlist", "N/A")
	parts = [
		f"🗺️ Map: {result.get('name', 'Unknown')}",
		f"mode: {random.choice(['Bomb', 'Secure Area', 'Hostage'])}",
	]

	return "\n".join(parts)

