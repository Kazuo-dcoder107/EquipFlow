"""Tag linking: ties a registered account to the user's RFID/NFC ID tag at the kiosk."""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EventResult, EventType, User, UserStatus
from app.services.borrowing import Result, _fail, _log
from app.services.tags import normalize_tag, resolve_tag


def enroll(db: Session, sr_code: str, user_uid: str, kiosk_id: Optional[int] = None) -> Result:
    user = db.scalar(select(User).where(User.sr_code == sr_code))
    if user is None:
        return _fail(db, EventType.enroll, "unknown_user", "Unknown SR-code", kiosk_id=kiosk_id)
    ids = dict(kiosk_id=kiosk_id, user_id=user.id)
    if user.status == UserStatus.pending_approval:
        return _fail(db, EventType.enroll, "not_approved", "Awaiting approval", **ids)
    if user.status == UserStatus.active or user.rfid_uid is not None:
        return _fail(db, EventType.enroll, "already_enrolled", "Already enrolled", **ids)
    kind, _ = resolve_tag(db, user_uid)
    if kind == "item":
        return _fail(db, EventType.enroll, "wrong_tag_type", "Item tag. Use an ID card", **ids)
    if kind == "user":
        return _fail(db, EventType.enroll, "tag_taken", "Tag already used", **ids)

    user.rfid_uid = normalize_tag(user_uid)     # stored the way lookups compare it
    user.rfid_active = True
    user.status = UserStatus.active
    _log(db, EventType.enroll, EventResult.success, **ids)
    db.commit()
    return Result(True, "ok", "Registered")
