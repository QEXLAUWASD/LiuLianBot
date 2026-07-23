import sys
from pathlib import Path

DISCORD_PART = Path(__file__).resolve().parents[1]
if str(DISCORD_PART) not in sys.path:
    sys.path.insert(0, str(DISCORD_PART))
