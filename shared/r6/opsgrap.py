# shared/r6/opsgrap.py
import json, os, requests
from bs4 import BeautifulSoup

URL = "https://www.ubisoft.com/en-gb/game/rainbow-six/siege/game-info/operators"


def parse_operator_detail(url: str):
    """Fetch operator detail page and extract role, icon, and loadout lists."""
    try:
        html = requests.get(url, timeout=30).text
    except Exception:
        return "", "", [], [], []

    soup = BeautifulSoup(html, "html.parser")
    primaries, secondaries, gadgets = [], [], []

    role = ""
    role_el = (
        soup.select_one(".operator__intro__role")
        or soup.select_one("[data-testid='operator-role']")
        or soup.select_one(".operator__header__side__detail")
    )
    if role_el:
        role = role_el.get_text(strip=True)

    icon = ""
    icon_el = soup.select_one(".operator__header__badge img") or soup.select_one(".operator__badge img") or soup.select_one("[data-testid='operator-icon'] img")
    if icon_el and icon_el.has_attr("src"):
        icon = icon_el["src"]

    for cat in soup.select(".operator__loadout__category"):
        title_el = cat.select_one(".operator__loadout__category__title")
        if not title_el:
            continue
        title = title_el.get_text(strip=True).lower()
        items = [w.get_text(strip=True) for w in cat.select(".operator__loadout__weapon p:first-child") if w.get_text(strip=True)]
        if "primary" in title:
            primaries.extend(items)
        elif "secondary" in title:
            secondaries.extend(items)
        elif "gadget" in title:
            gadgets.extend(items)

    return role, icon, primaries, secondaries, gadgets

def scrape():
    html = requests.get(URL, timeout=30).text
    soup = BeautifulSoup(html, "html.parser")
    data = {"Att": {}, "Def": {}}

    cards = soup.select("[data-testid='operator-card']")
    if not cards:
        cards = soup.select(".oplist__cards__wrapper a, .oplist__cards__wrapper article, .oplist__cards__wrapper div")

    for card in cards:
        name_el = (card.select_one("[data-testid='operator-name']") or
                   card.select_one(".operator-name") or
                   card.select_one("h3") or
                   card.select_one("[class*='name']") or
                   card.select_one("span"))
        if not name_el:
            continue
        name = name_el.get_text(strip=True)

        role_el = (
            card.select_one("[data-testid='operator-role']")
            or card.select_one("[class*='role']")
            or card.select_one(".operator__header__side__detail")
        )
        role = role_el.get_text(strip=True) if role_el else ""

        icon_el = card.select_one(".oplist__card__icon") or card.select_one("img")
        icon = icon_el["src"] if icon_el and icon_el.has_attr("src") else ""

        primaries = [e.get_text(strip=True) for e in card.select("[data-testid='weapon-primary']")]
        secondaries = [e.get_text(strip=True) for e in card.select("[data-testid='weapon-secondary']")]
        gadgets = [e.get_text(strip=True) for e in card.select("[data-testid='operator-gadget']")]

        # Fallback: scrape operator detail page if role or loadout missing
        if not role or not primaries or not secondaries or not gadgets or not icon:
            link_el = card if card.name == "a" else card.select_one("a")
            href_val = link_el.get("href") if link_el else None
            if href_val:
                href_str = href_val if isinstance(href_val, str) else "".join(href_val)
                detail_url = href_str if href_str.startswith("http") else "https://www.ubisoft.com" + href_str
                drole, dicon, dp, ds, dg = parse_operator_detail(detail_url)
                if drole:
                    role = drole
                if dicon:
                    icon = dicon
                if dp:
                    primaries = dp
                if ds:
                    secondaries = ds
                if dg:
                    gadgets = dg

        bucket = "Att" if role.lower().startswith("attack") else "Def"
        data[bucket][name] = {
            "name": name,
            "icon": icon,
            "weapon": {
                "primary": primaries,
                "secondary": secondaries,
                "gadget": gadgets,
            }
        }
        print(f"Loaded {name} -> role={role or 'unknown'}, bucket={bucket}, primaries={len(primaries)}, secondaries={len(secondaries)}, gadgets={len(gadgets)}")
    return data

if __name__ == "__main__":
    ops = scrape()
    out_path = os.path.join(os.path.dirname(__file__), "operatorlist.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(ops, f, indent=4, ensure_ascii=False)
    print(f"Wrote {sum(len(v) for v in ops.values())} operators to {out_path}.")
