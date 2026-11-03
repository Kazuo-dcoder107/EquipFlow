"""Kiosk login sessions, held by the API (option 2A).

Tapping an ID tag logs that user in on that kiosk. The session ends after
SESSION_TIMEOUT_SECONDS without activity, or when the kiosk calls /logout.
Kept in memory: fine for a single kiosk and a single API worker (the same
assumption the scheduler already makes). Move to a table if you add workers.
"""
import threading
import time
from typing import Dict, Optional, Tuple

from app.config import SESSION_TIMEOUT_SECONDS

_lock = threading.Lock()
_sessions: Dict[int, Tuple[int, float]] = {}   # kiosk_id -> (user_id, last activity)
_clock = time.monotonic                        # tests replace this


def open_session(kiosk_id: int, user_id: int) -> None:
    with _lock:
        _sessions[kiosk_id] = (user_id, _clock())


def current_user_id(kiosk_id: int) -> Optional[int]:
    """The logged-in user for this kiosk, or None. Activity refreshes the timeout."""
    with _lock:
        entry = _sessions.get(kiosk_id)
        if entry is None:
            return None
        user_id, last = entry
        if _clock() - last > SESSION_TIMEOUT_SECONDS:
            del _sessions[kiosk_id]
            return None
        _sessions[kiosk_id] = (user_id, _clock())
        return user_id


def close_session(kiosk_id: int) -> None:
    with _lock:
        _sessions.pop(kiosk_id, None)


def clear_all() -> None:
    with _lock:
        _sessions.clear()
