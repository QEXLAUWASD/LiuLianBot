"""
Deprecated shim — voice-channel event logging has moved to
``features.server_logger``.

Import ``on_voice_state_update`` from this module for backward compatibility.
"""

from features.server_logger.voice_events import on_voice_state_update  # noqa: F401
