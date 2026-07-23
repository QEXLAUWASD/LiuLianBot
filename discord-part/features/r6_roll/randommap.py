import os
import random
from typing import Any, Dict

from features.r6_roll.data_cache import JsonDataCache

# Resolve shared/ folder at project root (3 levels up from this file)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
_SHARED_R6 = os.path.join(_PROJECT_ROOT, 'shared', 'r6')


def _map_file_path() -> str:
	return os.path.join(_SHARED_R6, "maplist.json")


MAP_CACHE = JsonDataCache(_map_file_path())


def load_maps() -> Dict[str, Dict[str, Any]]:
	return MAP_CACHE.get()


def _normalize_entry(name_key: str, info: Dict[str, Any]) -> Dict[str, Any]:
	name = info.get("name") or name_key
	url = info.get("url", "")
	location = info.get("location", "")
	playlists_val = info.get("playlists") or []
	playlists = playlists_val if isinstance(playlists_val, list) else [str(playlists_val)]
	playlists = [p for p in playlists if str(p).strip()]
	return {
		"name": name,
		"url": url,
		"location": location,
		"playlists": playlists,
	}


def random_map() -> Dict[str, Any]:
	data = load_maps()
	if not isinstance(data, dict) or not data:
		raise ValueError("No maps available")

	# Prefer entries with at least a name
	entries = []
	for key, info in data.items():
		if not isinstance(info, dict):
			continue
		norm = _normalize_entry(key, info)
		if norm["name"]:
			entries.append(norm)

	if not entries:
		raise ValueError("No valid maps in maplist.json")

	picked = random.choice(entries)
	playlists = picked.get("playlists") or []
	chosen_playlist = random.choice(playlists) if playlists else "N/A"
	picked = dict(picked)
	picked["playlist"] = chosen_playlist
	return picked

