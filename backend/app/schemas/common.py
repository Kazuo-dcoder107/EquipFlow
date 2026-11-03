from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer


def _as_utc_z(d: datetime) -> str:
    """The database stores naive UTC; send it out as '2026-10-03T04:00:00Z'."""
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UtcDatetime = Annotated[datetime, PlainSerializer(_as_utc_z, return_type=str, when_used="json")]
