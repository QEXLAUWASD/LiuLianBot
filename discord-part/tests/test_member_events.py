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
            assert action.value == 11
            if self.calls < 6:
                return
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr("features.server_logger.base.asyncio.sleep", no_wait)
    guild = FakeGuild()

    actor = asyncio.run(get_audit_actor(guild, "channel_update", 456))

    assert actor == "actor"
    assert guild.calls == 6


def test_audit_actor_lookup_rejects_unknown_action_name():
    class FakeGuild:
        id = 123

        async def audit_logs(self, *, limit, action):
            raise AssertionError("Invalid actions must not reach Discord.")
            yield

    actor = asyncio.run(get_audit_actor(FakeGuild(), "not_an_audit_action", 456))

    assert actor is None


def test_audit_actor_lookup_accepts_numeric_action_value():
    class FakeGuild:
        id = 123

        async def audit_logs(self, *, limit, action):
            assert action.value == 12
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    actor = asyncio.run(get_audit_actor(FakeGuild(), 12, 456, retries=1))

    assert actor == "actor"

def test_audit_actor_lookup_accepts_numeric_action_string():
    class FakeGuild:
        id = 123

        async def audit_logs(self, *, limit, action):
            assert action.value == 10
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    actor = asyncio.run(get_audit_actor(FakeGuild(), "10", 456, retries=1))

    assert actor == "actor"


def test_audit_actor_lookup_accepts_compatible_enum_value():
    class CompatibleAuditAction:
        value = 11

    class FakeGuild:
        id = 123

        async def audit_logs(self, *, limit, action):
            assert action.value == 11
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    actor = asyncio.run(
        get_audit_actor(FakeGuild(), CompatibleAuditAction(), 456, retries=1)
    )

    assert actor == "actor"

def test_audit_actor_lookup_accepts_unknown_numeric_action_value():
    class FakeGuild:
        id = 123

        async def audit_logs(self, *, limit, action):
            assert action.value == 32
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    actor = asyncio.run(get_audit_actor(FakeGuild(), 32, 456, retries=1))

    assert actor == "actor"

def test_audit_actor_lookup_accepts_any_nonnegative_numeric_action_value():
    class FakeGuild:
        id = 123

        async def audit_logs(self, *, limit, action):
            assert action.value == 999999
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    actor = asyncio.run(get_audit_actor(FakeGuild(), 999999, 456, retries=1))

    assert actor == "actor"

def test_audit_actor_lookup_matches_permission_overwrite_action():
    class FakeGuild:
        id = 123

        async def audit_logs(self, *, limit, action):
            if action.value != 14:
                return
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    actor = asyncio.run(
        get_audit_actor(
            FakeGuild(),
            (
                discord.AuditLogAction.channel_update,
                discord.AuditLogAction.overwrite_create,
                discord.AuditLogAction.overwrite_update,
                discord.AuditLogAction.overwrite_delete,
            ),
            456,
            retries=1,
        )
    )

    assert actor == "actor"

def test_audit_actor_lookup_accepts_member_move_action():
    class FakeGuild:
        id = 123

        async def audit_logs(self, *, limit, action):
            assert action.value == 26
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    actor = asyncio.run(
        get_audit_actor(FakeGuild(), discord.AuditLogAction.member_move, 456, retries=1)
    )

    assert actor == "actor"

def test_audit_actor_lookup_accepts_batch_of_numeric_actions():
    class FakeGuild:
        id = 123
        seen = []

        async def audit_logs(self, *, limit, action):
            self.seen.append(action.value)
            if action.value != 30:
                return
            yield SimpleNamespace(
                created_at=_now(), target=SimpleNamespace(id=456), user="actor"
            )

    guild = FakeGuild()
    actor = asyncio.run(get_audit_actor(guild, tuple(range(1, 31)), 456, retries=1))

    assert actor == "actor"
    assert guild.seen == list(range(1, 31))

def test_member_move_falls_back_to_unfiltered_audit_scan():
    class FakeGuild:
        id = 123

        async def audit_logs(self, *, limit, action=None):
            if action is not None:
                return
            yield SimpleNamespace(
                created_at=_now(),
                action=SimpleNamespace(value=26),
                target=SimpleNamespace(id=456),
                user="actor",
            )

    actor = asyncio.run(
        get_audit_actor(FakeGuild(), discord.AuditLogAction.member_move, 456, retries=1)
    )

    assert actor == "actor"