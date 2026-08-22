import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import discord

from features.server_logger.base import _now, add_audit_actor_field
from features.server_logger.base import get_audit_actor
from features.server_logger.member_events import _format_timedelta


def test_now_is_timezone_aware_utc():
    current = _now()

    assert current.tzinfo is not None
    assert current.utcoffset().total_seconds() == 0


def test_member_age_accepts_discord_aware_timestamp():
    created_at = datetime(2026, 7, 20, tzinfo=timezone.utc)
    now = datetime(2026, 7, 23, 5, 30, tzinfo=timezone.utc)

    assert _format_timedelta(now - created_at) == "3d 5h 30m"


def test_missing_audit_actor_uses_localized_fallback(monkeypatch):
    monkeypatch.setattr(
        "core.config._config", {"default_language": "zh_TW"}
    )
    embed = discord.Embed()

    add_audit_actor_field(embed, None, 123)

    assert embed.fields[-1].name == "操作者"
    assert embed.fields[-1].value == "未知（Audit Log 無法取得或尚未同步）"


def test_audit_actor_lookup_retries_until_audit_entry_is_available(monkeypatch):
    class FakeGuild:
        id = 123
        calls = 0

        async def audit_logs(self, *, limit, action):
            self.calls += 1
            if self.calls < 2:
                return
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr("features.server_logger.base.asyncio.sleep", no_wait)
    guild = FakeGuild()

    actor = asyncio.run(get_audit_actor(guild, "channel_update", 456, retries=2))

    assert actor == "actor"
    assert guild.calls == 2
