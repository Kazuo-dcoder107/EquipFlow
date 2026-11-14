"""The terms a user accepts at the kiosk before borrowing hardware.

The text lives in a plain file (config.KIOSK_TERMS_FILE) so staff can edit it. The version is a hash
of the text: it changes by itself whenever the text changes. The kiosk sends the version it showed
back when the user accepts, so acceptance can never be recorded against newer, unseen wording.
"""
import hashlib
from typing import Tuple

from app.config import DEFAULT_KIOSK_TERMS, KIOSK_TERMS_FILE

MAX_CHARS = 400     # the kiosk screen is tiny; longer text is cut


def current_terms() -> Tuple[str, str]:
    """Return (version, text)."""
    try:
        # Read raw bytes to prevent automatic newline conversion.
        text = KIOSK_TERMS_FILE.read_bytes().decode("utf-8")
    except OSError:
        text = DEFAULT_KIOSK_TERMS

    # Normalize Windows and Unix line endings.
    text = (
        text.replace("\r\r\n", "\n")
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .strip()[:MAX_CHARS]
            .strip()
        or DEFAULT_KIOSK_TERMS
    )

    version = hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]

    return version, text
