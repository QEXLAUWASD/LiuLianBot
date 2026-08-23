import logging
import sys

from utils.logger import ColoredFormatter


def test_colored_formatter_interpolates_log_arguments():
    record = logging.LogRecord(
        "features.server_logger.base",
        logging.WARNING,
        __file__,
        1,
        "Unexpected audit-log lookup failure for guild %s",
        (123,),
        None,
    )

    formatted = ColoredFormatter().format(record)

    assert "guild 123" in formatted
    assert "%s" not in formatted


def test_colored_formatter_includes_exception_details():
    try:
        raise RuntimeError("Audit Log request failed")
    except RuntimeError:
        record = logging.LogRecord(
            "features.server_logger.base",
            logging.WARNING,
            __file__,
            1,
            "Unexpected audit-log lookup failure",
            (),
            sys.exc_info(),
        )

    formatted = ColoredFormatter().format(record)

    assert "RuntimeError: Audit Log request failed" in formatted
