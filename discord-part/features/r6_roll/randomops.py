import os
import random
from typing import Dict, Tuple, Optional

from features.r6_roll.data_cache import JsonDataCache

# Resolve shared/ folder at project root (3 levels up from this file)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
_SHARED_R6 = os.path.join(_PROJECT_ROOT, 'shared', 'r6')


def _operator_file_path() -> str:
	return os.path.join(_SHARED_R6, "operatorlist.json")


OPERATOR_CACHE = JsonDataCache(_operator_file_path())


def load_ops() -> Dict[str, Dict[str, dict]]:
	return OPERATOR_CACHE.get()


def _flatten_ops(data: Dict[str, Dict[str, dict]], side: Optional[str]) -> Tuple[str, dict]:
	bucket_keys = []
	if side is None:
		bucket_keys = ["Att", "Def"]
	elif side.lower().startswith("att"):
		bucket_keys = ["Att"]
	elif side.lower().startswith("def"):
		bucket_keys = ["Def"]
	else:
		bucket_keys = ["Att", "Def"]

	candidates = []
	for key in bucket_keys:
		for name, info in data.get(key, {}).items():
			candidates.append((name, info))

	if not candidates:
		raise ValueError("No operators available for the requested side")

	return random.choice(candidates)


def _pick_one(items):
	return random.choice(items) if items else "N/A"


def random_operator(side: Optional[str] = None) -> Dict[str, str]:
	data = load_ops()
	name, info = _flatten_ops(data, side)
	weapon = info.get("weapon", {}) if isinstance(info, dict) else {}
	primaries = weapon.get("primary", []) or []
	secondaries = weapon.get("secondary", []) or []
	gadgets = weapon.get("gadget", []) or []

	return {
		"name": name,
		"icon": info.get("icon", "") if isinstance(info, dict) else "",
		"side": "Att" if (side and side.lower().startswith("att")) else ("Def" if (side and side.lower().startswith("def")) else ("Att" if name in data.get("Att", {}) else "Def")),
		"primary": _pick_one(primaries),
		"secondary": _pick_one(secondaries),
		"gadget": _pick_one(gadgets),
	}

