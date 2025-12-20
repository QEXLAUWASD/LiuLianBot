import json
import os
import random
from typing import Dict, Tuple, Optional


def _operator_file_path() -> str:
	return os.path.join(os.path.dirname(__file__), "operatorlist.json")


def load_ops() -> Dict[str, Dict[str, dict]]:
	path = _operator_file_path()
	with open(path, "r", encoding="utf-8") as f:
		data = json.load(f)
	return data


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

