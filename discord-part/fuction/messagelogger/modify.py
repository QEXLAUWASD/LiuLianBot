"""
Deprecated shim — message logging has moved to ``fuction.server_logger``.

All public names are still importable from this module for backward
compatibility:

* ``on_message_edit``, ``on_message_delete``
* ``set_log_channel``, ``get_log_channel``, ``init_log_channel_table``
"""

from fuction.server_logger.message_events import on_message_edit, on_message_delete  # noqa: F401
from fuction.server_logger.base import (  # noqa: F401
    set_log_channel,
    get_log_channel,
    init_log_channel_table,
)