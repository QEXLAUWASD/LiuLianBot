from datetime import datetime, timezone

from features.server_logger.base import _now
from features.server_logger.member_events import _format_timedelta


def test_now_is_timezone_aware_utc():
    current = _now()

    assert current.tzinfo is not None
    assert current.utcoffset().total_seconds() == 0


def test_member_age_accepts_discord_aware_timestamp():
    created_at = datetime(2026, 7, 20, tzinfo=timezone.utc)
    now = datetime(2026, 7, 23, 5, 30, tzinfo=timezone.utc)

    assert _format_timedelta(now - created_at) == "3d 5h 30m"
