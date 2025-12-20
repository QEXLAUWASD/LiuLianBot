import re

from fuction.r6Roll.randommap import load_maps


def _find_map(data, query: str):
	q = query.lower()
	best = None
	for key, info in data.items():
		if not isinstance(info, dict):
			continue
		name = str(info.get("name") or key)
		hay = name.lower()
		if hay == q:
			return name, info
		if hay.startswith(q) and best is None:
			best = (name, info)
		if q in hay and best is None:
			best = (name, info)
	return best


async def getr6mapinfo(message, bot):
	parts = message.content.split(maxsplit=1)
	if len(parts) < 2:
		return "Usage: >getr6mapinfo <map name>"

	query = parts[1]
	data = load_maps()
	found = _find_map(data, query)
	if not found:
		return f"No map found matching '{query}'."

	name, info = found
	playlists = info.get("playlists") or []
	playlists = playlists if isinstance(playlists, list) else [str(playlists)]
	location = info.get("location", "N/A")
	released = info.get("released") or ""
	url = info.get("url") or ""

	lines = [f"🗺️ Map: {name}", f"Location: {location}"]
	if playlists:
		lines.append("Playlists: " + ", ".join(playlists))
	if released:
		lines.append(f"Released: {released}")
	if url:
		lines.append(f"More info: {url}")

	return "\n".join(lines)

