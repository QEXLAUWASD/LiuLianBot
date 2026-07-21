"""Scrape Rainbow Six Siege map list and metadata from Ubisoft pages."""

import json
import os
import re
from typing import Any, Dict, List

import requests
from bs4 import BeautifulSoup


MAP_LIST_URL = "https://www.ubisoft.com/en-gb/game/rainbow-six/siege/game-info/maps"


def fetch_html(url: str) -> str:
	resp = requests.get(url, timeout=30)
	resp.raise_for_status()
	return resp.text


def extract_map_links(list_html: str) -> Dict[str, str]:
	soup = BeautifulSoup(list_html, "html.parser")
	links = {}
	for a in soup.select("a[href*='/game-info/maps/']"):
		href_val = a.get("href")
		if not href_val:
			continue
		href = href_val[0] if isinstance(href_val, list) else href_val
		href = str(href)
		if href.rstrip("/").endswith("/maps"):
			continue
		url = href if href.startswith("http") else "https://www.ubisoft.com" + href
		slug = url.rstrip("/").split("/")[-1]
		links[slug] = url
	return links


def _find_text_by_label(text: str, label: str) -> str:
	match = re.search(label + r"\s*:\s*([^\n<]+)", text, flags=re.IGNORECASE)
	return match.group(1).strip() if match else ""


def _split_list(val: str) -> List[str]:
	return [item.strip() for item in val.replace("/", ",").split(",") if item.strip()]


def parse_map_detail(url: str) -> Dict[str, object]:
	html = fetch_html(url)
	soup = BeautifulSoup(html, "html.parser")

	raw_text = soup.get_text("\n")

	name = ""
	name_el = soup.select_one("h1") or soup.select_one("h2") or soup.select_one("[data-testid='map-name']")
	if name_el:
		name = name_el.get_text(strip=True)
	if not name:
		og_title = soup.select_one("meta[property='og:title']")
		if og_title and og_title.get("content"):
			name = str(og_title.get("content")).strip()

	location = _find_text_by_label(raw_text, "Location")
	released = _find_text_by_label(raw_text, "Released")
	playlists_raw = _find_text_by_label(raw_text, "Playlists")
	reworked = _find_text_by_label(raw_text, "Map reworked")

	description = ""
	for p in soup.select("p"):
		text = p.get_text(" ", strip=True)
		if len(text) > 80:
			description = text
			break

	blueprint_zip = ""
	bp_link = soup.find("a", href=re.compile(r"blueprints"))
	if bp_link and bp_link.get("href"):
		href_val = bp_link.get("href")
		href = href_val[0] if isinstance(href_val, list) else href_val
		href = str(href)
		blueprint_zip = href if href.startswith("http") else "https://www.ubisoft.com" + href

	floors: List[str] = []
	bp_section = None
	for h in soup.find_all(["h2", "h3", "strong"]):
		if "blueprint" in h.get_text(" ", strip=True).lower():
			bp_section = h.parent
			break
	if bp_section:
		tokens = re.findall(r"[A-Z0-9]{3,}\b", bp_section.get_text(" ", strip=True))
		seen = set()
		for token in tokens:
			if token not in seen:
				floors.append(token)
				seen.add(token)

	return {
		"name": name,
		"url": url,
		"location": location,
		"released": released,
		"playlists": _split_list(playlists_raw),
		"reworked": reworked,
		"description": description,
		"blueprint_zip": blueprint_zip,
		"floors": floors,
	}


def scrape_maps() -> Dict[str, Dict[str, Any]]:
	index_html = fetch_html(MAP_LIST_URL)
	links = extract_map_links(index_html)
	data: Dict[str, Dict[str, Any]] = {}
	for slug, url in links.items():
		try:
			info = parse_map_detail(url)
		except Exception as exc:
			print(f"Failed {slug}: {exc}")
			continue
		name_val = info.get("name") or slug
		name = str(name_val)
		playlists_val = info.get("playlists") or []
		playlists = playlists_val if isinstance(playlists_val, list) else [str(playlists_val)]
		floors_val = info.get("floors") or []
		floors = floors_val if isinstance(floors_val, list) else [str(floors_val)]
		data[name] = info
		print(f"Loaded map {name} ({slug}) -> playlists={len(playlists)}, floors={len(floors)}")
	return data


if __name__ == "__main__":
	maps = scrape_maps()
	out_path = os.path.join(os.path.dirname(__file__), "maplist.json")
	with open(out_path, "w", encoding="utf-8") as f:
		json.dump(maps, f, ensure_ascii=False, indent=4)
	print(f"Wrote {len(maps)} maps to {out_path}.")
