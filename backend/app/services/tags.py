import re
from typing import Optional, Tuple, Union

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Equipment, User


def normalize_tag(uid: str) -> str:
    """Make RFID/NFC UIDs comparable however they were typed or sent:
    '04:a1:b2:c3', '04-A1-B2-C3' and '04a1b2c3' all become '04A1B2C3'."""
    return re.sub(r"[\s:\-]", "", uid).upper()


def resolve_tag(db: Session, uid: str) -> Tuple[Optional[str], Optional[Union[User, Equipment]]]:
    """Who does this tag belong to? Returns ("user", User), ("item", Equipment) or
    (None, None). A UID can never be both: linking and registering reject duplicates."""
    uid = normalize_tag(uid)
    user = db.scalar(select(User).where(User.rfid_uid == uid))
    if user is not None:
        return "user", user
    item = db.scalar(select(Equipment).where(Equipment.rfid_uid == uid))
    if item is not None:
        return "item", item
    return None, None
