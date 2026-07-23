from collections.abc import Callable
from uuid import uuid4


def generate_error_reference() -> str:
    """Return a short identifier suitable for correlating public errors to logs."""
    return uuid4().hex[:12]


def format_public_error(localized_message: str, reference: str) -> str:
    """Remove an error-detail placeholder and append a safe correlation reference."""
    base_message = localized_message.replace("{error}", "").rstrip(" :：")
    return f"{base_message} (Reference: {reference})"


def report_exception(
    logger,
    operation: str,
    localized_message: str,
    *,
    reference_generator: Callable[[], str] | None = None,
) -> str:
    """Log the active exception with a reference and return a safe public message."""
    generator = reference_generator or generate_error_reference
    reference = generator()
    logger.error(
        "%s failed [reference=%s]",
        operation,
        reference,
        exc_info=True,
    )
    return format_public_error(localized_message, reference)
