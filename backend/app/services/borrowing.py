"""Borrow / return rules. The kiosk endpoints call these functions."""
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import FACULTY_BOOK_LOAN_DAYS, FACULTY_MAX_BOOKS
from app.models import (
    ActivityLog,
    Category,
    CategoryType,
    Equipment,
    EquipmentStatus,
    EventResult,
    EventType,
    Penalty,
    PenaltyStatus,
    PenaltyType,
    Transaction,
    TransactionStatus,
    User,
    UserRole,
    UserStatus,
)
from app.services.tags import normalize_tag, resolve_tag

MAX_BOOKS = 2      # a student may hold up to 2 books...
MAX_HARDWARE = 1   # ...or 1 hardware item, never a mix
FACULTY_ROLES = (UserRole.teacher, UserRole.staff)   # own book rules; hardware is the same


@dataclass
class Result:
    ok: bool
    code: str       # machine-readable reason, e.g. "limit_reached"
    message: str    # short text for the OLED
    transaction: Optional[Transaction] = None
    user: Optional[User] = None


def _now() -> datetime:
    """Naive UTC, matching how SQLite hands datetimes back."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _log(db, event, result, kiosk_id=None, user_id=None, equipment_id=None):
    db.add(ActivityLog(kiosk_id=kiosk_id, user_id=user_id, equipment_id=equipment_id,
                       event_type=event, result=result))


def _fail(db, event, code, message, **ids) -> Result:
    _log(db, event, EventResult.failed, **ids)
    db.commit()
    return Result(False, code, message)


def compute_fine(due_at: datetime, until: datetime, fine_per_day: int) -> int:
    """Each started day past due counts as a full day."""
    if until <= due_at:
        return 0
    days = math.ceil((until - due_at).total_seconds() / 86400)
    return days * fine_per_day


def current_fine(tx: Transaction, now: Optional[datetime] = None) -> int:
    """Fine so far for a transaction (live while out, fixed once returned)."""
    until = tx.returned_at or now or _now()
    return compute_fine(tx.due_at, until, tx.equipment.category.fine_per_day)


def _active_counts(db: Session, user_id: int):
    types = db.execute(
        select(Category.type)
        .join(Equipment, Equipment.category_id == Category.id)
        .join(Transaction, Transaction.equipment_id == Equipment.id)
        .where(Transaction.user_id == user_id, Transaction.returned_at.is_(None),
               Transaction.status != TransactionStatus.lost)
    ).scalars().all()
    return types.count(CategoryType.book), types.count(CategoryType.hardware)


def _blocked_reason(db: Session, user_id: int, now: datetime) -> Optional[Result]:
    """Blocking rule: an unpaid fine or an overdue loan stops new borrowing until cleared
    (paid or waived penalties, and returned items, no longer count)."""
    if db.scalar(select(Penalty.id).where(Penalty.user_id == user_id,
                                          Penalty.status == PenaltyStatus.unpaid).limit(1)):
        return Result(False, "unpaid_fine", "Unpaid fine")
    if db.scalar(select(Transaction.id).where(
            Transaction.user_id == user_id, Transaction.returned_at.is_(None),
            Transaction.status != TransactionStatus.lost,
            Transaction.due_at < now).limit(1)):
        return Result(False, "has_overdue", "Return overdue item")
    return None


def login(db: Session, user_uid: str, kiosk_id: Optional[int] = None) -> Result:
    """The ID-tag tap that opens a kiosk session. The caller opens the session on ok."""
    kind, owner = resolve_tag(db, user_uid)
    if kind is None:
        return _fail(db, EventType.login, "unknown_tag", "Unknown tag", kiosk_id=kiosk_id)
    if kind == "item":
        return _fail(db, EventType.login, "wrong_tag_type", "Item tag. Tap your ID",
                     kiosk_id=kiosk_id, equipment_id=owner.id)
    user = owner
    ids = dict(kiosk_id=kiosk_id, user_id=user.id)
    if not user.rfid_active:
        return _fail(db, EventType.login, "tag_deactivated", "Tag deactivated", **ids)
    if user.status == UserStatus.pending_approval:
        return _fail(db, EventType.login, "not_approved", "Awaiting approval", **ids)
    if user.status != UserStatus.active:
        return _fail(db, EventType.login, "user_not_active", "Account inactive", **ids)
    _log(db, EventType.login, EventResult.success, **ids)
    db.commit()
    return Result(True, "ok", "Welcome " + user.full_name.split()[0], user=user)


def borrow(db: Session, item_uid: str, user_id: int,
           agreed: bool = False, kiosk_id: Optional[int] = None) -> Result:
    """`user_id` comes from the kiosk's login session."""
    user = db.get(User, user_id)
    if user is None:
        return _fail(db, EventType.tag_error, "unknown_user", "User not found", kiosk_id=kiosk_id)
    ids = dict(kiosk_id=kiosk_id, user_id=user.id)
    if user.status != UserStatus.active:
        return _fail(db, EventType.borrow, "user_not_active", "Account inactive", **ids)
    if not user.rfid_active:
        return _fail(db, EventType.borrow, "tag_deactivated", "Tag deactivated", **ids)

    now = _now()
    blocked_by = _blocked_reason(db, user.id, now)
    if blocked_by is not None:
        return _fail(db, EventType.borrow, blocked_by.code, blocked_by.message, **ids)

    item_uid = normalize_tag(item_uid)
    item = db.scalar(select(Equipment).where(Equipment.rfid_uid == item_uid))
    if item is None:
        if resolve_tag(db, item_uid)[0] == "user":
            return _fail(db, EventType.scan, "wrong_tag_type", "ID tag. Scan the item", **ids)
        return _fail(db, EventType.scan, "unknown_item", "Unknown tag", **ids)
    ids["equipment_id"] = item.id
    if item.status != EquipmentStatus.available:
        return _fail(db, EventType.borrow, "item_unavailable", "Not available", **ids)

    kind = item.category.type
    if kind == CategoryType.hardware and not agreed:
        return _fail(db, EventType.borrow, "agreement_required", "Accept terms first", **ids)

    faculty = user.role in FACULTY_ROLES
    books, hardware = _active_counts(db, user.id)
    if kind == CategoryType.book:
        blocked = hardware > 0 or books >= (FACULTY_MAX_BOOKS if faculty else MAX_BOOKS)
    else:
        blocked = hardware >= MAX_HARDWARE or books > 0
    if blocked:
        return _fail(db, EventType.limit_reached, "limit_reached", "Limit reached", **ids)

    loan_days = FACULTY_BOOK_LOAN_DAYS if (faculty and kind == CategoryType.book) \
        else item.category.loan_days
    tx = Transaction(
        equipment_id=item.id, user_id=user.id, borrowed_at=now,
        due_at=now + timedelta(days=loan_days),
        agreement_accepted_at=now if kind == CategoryType.hardware else None,
    )
    item.status = EquipmentStatus.borrowed
    db.add(tx)
    _log(db, EventType.borrow, EventResult.success, **ids)
    db.commit()
    return Result(True, "ok", "Borrowed", tx)


def return_item(db: Session, item_uid: str, kiosk_id: Optional[int] = None) -> Result:
    item_uid = normalize_tag(item_uid)
    item = db.scalar(select(Equipment).where(Equipment.rfid_uid == item_uid))
    if item is None:
        if resolve_tag(db, item_uid)[0] == "user":
            return _fail(db, EventType.return_, "wrong_tag_type", "ID tag. Scan the item",
                         kiosk_id=kiosk_id)
        return _fail(db, EventType.return_, "unknown_item", "Unknown tag", kiosk_id=kiosk_id)
    ids = dict(kiosk_id=kiosk_id, equipment_id=item.id)

    tx = db.scalar(select(Transaction).where(
        Transaction.equipment_id == item.id, Transaction.returned_at.is_(None),
        Transaction.status != TransactionStatus.lost))
    if tx is None:
        if item.status == EquipmentStatus.missing:   # a missing item turned up
            item.status = EquipmentStatus.available
            _log(db, EventType.return_, EventResult.success, **ids)
            db.commit()
            return Result(True, "found", "Item found")
        return _fail(db, EventType.return_, "not_borrowed", "Not borrowed", **ids)

    now = _now()
    tx.returned_at = now
    tx.status = TransactionStatus.returned
    fine = compute_fine(tx.due_at, now, item.category.fine_per_day)
    if fine > 0:
        days = fine // item.category.fine_per_day
        penalty = db.scalar(select(Penalty).where(
            Penalty.transaction_id == tx.id, Penalty.type == PenaltyType.overdue_fine))
        if penalty:
            penalty.amount = fine
        else:
            db.add(Penalty(transaction_id=tx.id, user_id=tx.user_id,
                           type=PenaltyType.overdue_fine, amount=fine,
                           status=PenaltyStatus.unpaid, notes=f"{days} day(s) overdue"))
    item.status = EquipmentStatus.available
    _log(db, EventType.return_, EventResult.success, user_id=tx.user_id, **ids)
    db.commit()
    return Result(True, "ok", f"Returned. Fine P{fine}" if fine else "Returned", tx)
