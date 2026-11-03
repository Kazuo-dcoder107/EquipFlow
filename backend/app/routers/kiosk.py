"""Endpoints called by the ESP32 kiosk (all need the X-API-Key header).

Business outcomes (limit reached, unknown tag, ...) come back as HTTP 200
with ok=false and a code, so the firmware only parses one JSON shape.
Only a bad API key returns an HTTP error (401).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SESSION_TIMEOUT_SECONDS
from app.database import get_db
from app.models import CategoryType, Equipment, Kiosk, User, UserStatus
from app.schemas.kiosk import (BorrowIn, EnrollIn, EquipmentOut, LoginIn, LoginOut,
                               PendingUser, PendingUsersOut, ResultOut, ReturnIn, ScanOut)
from app.security import get_kiosk
from app.services import borrowing, enrollment, sessions
from app.services.tags import normalize_tag, resolve_tag

router = APIRouter(prefix="/api/kiosk", tags=["kiosk"])


@router.post("/heartbeat")
def heartbeat(kiosk: Kiosk = Depends(get_kiosk)):
    # get_kiosk already refreshed last_seen
    return {"ok": True, "server_time": datetime.now(timezone.utc).isoformat()}


@router.get("/pending-users", response_model=PendingUsersOut)
def pending_users(kiosk: Kiosk = Depends(get_kiosk), db: Session = Depends(get_db)):
    rows = db.scalars(select(User).where(User.status == UserStatus.pending_enrollment)
                      .order_by(User.created_at)).all()
    return PendingUsersOut(users=[PendingUser(sr_code=u.sr_code, full_name=u.full_name)
                                  for u in rows])


@router.post("/enroll", response_model=ResultOut)
def enroll(body: EnrollIn, kiosk: Kiosk = Depends(get_kiosk), db: Session = Depends(get_db)):
    r = enrollment.enroll(db, body.sr_code, body.user_uid, kiosk_id=kiosk.id)
    return ResultOut(ok=r.ok, code=r.code, message=r.message)


@router.get("/scan/{uid}", response_model=ScanOut)
def scan(uid: str, kiosk: Kiosk = Depends(get_kiosk), db: Session = Depends(get_db)):
    """Tell the firmware what a tapped tag is, so it can show the right screen or alert."""
    kind, owner = resolve_tag(db, uid)
    if kind is None:
        return ScanOut(ok=False, code="unknown_tag", message="Unknown tag")
    if kind == "user":
        if not owner.rfid_active:
            return ScanOut(ok=False, code="tag_deactivated", message="Tag deactivated", kind="user")
        return ScanOut(ok=True, code="ok", message="ID tag", kind="user",
                       name=owner.full_name, role=owner.role.value)
    cat = owner.category
    return ScanOut(ok=True, code="ok", message="Item tag", kind="item", name=owner.name,
                   category=cat.name, type=cat.type.value, status=owner.status.value,
                   loan_days=cat.loan_days, requires_agreement=cat.type == CategoryType.hardware)


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, kiosk: Kiosk = Depends(get_kiosk), db: Session = Depends(get_db)):
    r = borrowing.login(db, body.user_uid, kiosk_id=kiosk.id)
    if not r.ok:
        return LoginOut(ok=False, code=r.code, message=r.message)
    sessions.open_session(kiosk.id, r.user.id)
    return LoginOut(ok=True, code=r.code, message=r.message, name=r.user.full_name,
                    role=r.user.role.value, session_seconds=SESSION_TIMEOUT_SECONDS)


@router.post("/logout", response_model=ResultOut)
def logout(kiosk: Kiosk = Depends(get_kiosk)):
    sessions.close_session(kiosk.id)
    return ResultOut(ok=True, code="ok", message="Logged out")


@router.get("/equipment/{item_uid}", response_model=EquipmentOut)
def equipment_lookup(item_uid: str, kiosk: Kiosk = Depends(get_kiosk),
                     db: Session = Depends(get_db)):
    item = db.scalar(select(Equipment).where(Equipment.rfid_uid == normalize_tag(item_uid)))
    if item is None:
        return EquipmentOut(ok=False, code="unknown_item", message="Unknown tag")
    cat = item.category
    return EquipmentOut(
        ok=True, code="ok", message="Found", name=item.name, category=cat.name,
        type=cat.type.value, status=item.status.value, loan_days=cat.loan_days,
        requires_agreement=cat.type == CategoryType.hardware)


@router.post("/borrow", response_model=ResultOut)
def borrow(body: BorrowIn, kiosk: Kiosk = Depends(get_kiosk), db: Session = Depends(get_db)):
    user_id = sessions.current_user_id(kiosk.id)
    if user_id is None:
        return ResultOut(ok=False, code="no_session", message="Tap your ID first")
    r = borrowing.borrow(db, body.item_uid, user_id, agreed=body.agreed, kiosk_id=kiosk.id)
    return ResultOut(ok=r.ok, code=r.code, message=r.message,
                     due_at=r.transaction.due_at if r.transaction else None)


@router.post("/return", response_model=ResultOut)
def return_item(body: ReturnIn, kiosk: Kiosk = Depends(get_kiosk),
                db: Session = Depends(get_db)):
    r = borrowing.return_item(db, body.item_uid, kiosk_id=kiosk.id)
    return ResultOut(ok=r.ok, code=r.code, message=r.message,
                     fine=borrowing.current_fine(r.transaction) if r.transaction else None)
