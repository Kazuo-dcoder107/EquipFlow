"""Read-side helpers: live transaction state, history and penalty queries."""
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import LOCAL_UTC_OFFSET_HOURS
from app.models import Equipment, Penalty, PenaltyStatus, PenaltyType, Transaction, TransactionStatus, User
from app.services.borrowing import _now, current_fine


def effective_status(tx: Transaction, now: Optional[datetime] = None) -> str:
    """borrowed | overdue | returned | lost, computed live (so it is right even
    before the scheduled overdue job has run)."""
    if tx.status == TransactionStatus.lost:
        return "lost"
    if tx.returned_at is not None:
        return "returned"
    return "overdue" if tx.due_at < (now or _now()) else "borrowed"


def fine_for(tx: Transaction, now: Optional[datetime] = None) -> int:
    return 0 if tx.status == TransactionStatus.lost else current_fine(tx, now)


def state_clause(state: str, now: datetime):
    active = and_(Transaction.returned_at.is_(None), Transaction.status != TransactionStatus.lost)
    return {
        "borrowed": and_(active, Transaction.due_at >= now),
        "overdue": and_(active, Transaction.due_at < now),
        "returned": Transaction.returned_at.is_not(None),
        "lost": Transaction.status == TransactionStatus.lost,
    }[state]


def _local_day_start_utc(d: date) -> datetime:
    return datetime.combine(d, time.min) - timedelta(hours=LOCAL_UTC_OFFSET_HOURS)


def query_transactions(db: Session, user_id: Optional[int] = None,
                       equipment_id: Optional[int] = None, state: Optional[str] = None,
                       search: Optional[str] = None, from_date: Optional[date] = None,
                       to_date: Optional[date] = None, limit: int = 50, offset: int = 0):
    now = _now()
    q = (select(Transaction)
         .join(Equipment, Equipment.id == Transaction.equipment_id)
         .join(User, User.id == Transaction.user_id))
    if user_id:
        q = q.where(Transaction.user_id == user_id)
    if equipment_id:
        q = q.where(Transaction.equipment_id == equipment_id)
    if state:
        q = q.where(state_clause(state, now))
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.where(or_(User.sr_code.ilike(like), User.full_name.ilike(like),
                        Equipment.name.ilike(like)))
    if from_date:
        q = q.where(Transaction.borrowed_at >= _local_day_start_utc(from_date))
    if to_date:
        q = q.where(Transaction.borrowed_at < _local_day_start_utc(to_date + timedelta(days=1)))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(
        q.options(selectinload(Transaction.equipment).selectinload(Equipment.category),
                  selectinload(Transaction.user))
        .order_by(Transaction.borrowed_at.desc(), Transaction.id.desc())
        .limit(limit).offset(offset)).all()
    return total, rows, now


def query_penalties(db: Session, user_id: Optional[int] = None,
                    status: Optional[PenaltyStatus] = None, type: Optional[PenaltyType] = None,
                    search: Optional[str] = None, limit: int = 50, offset: int = 0):
    def apply(stmt):
        stmt = stmt.join(User, User.id == Penalty.user_id)
        if user_id:
            stmt = stmt.where(Penalty.user_id == user_id)
        if status:
            stmt = stmt.where(Penalty.status == status)
        if type:
            stmt = stmt.where(Penalty.type == type)
        if search and search.strip():
            like = f"%{search.strip()}%"
            stmt = stmt.where(or_(User.sr_code.ilike(like), User.full_name.ilike(like)))
        return stmt

    total = db.scalar(apply(select(func.count(Penalty.id)).select_from(Penalty)))
    unpaid_total = db.scalar(
        apply(select(func.coalesce(func.sum(Penalty.amount), 0)).select_from(Penalty))
        .where(Penalty.status == PenaltyStatus.unpaid))
    rows = db.scalars(
        apply(select(Penalty)).options(
            selectinload(Penalty.transaction).selectinload(Transaction.equipment),
            selectinload(Penalty.transaction).selectinload(Transaction.user))
        .order_by(Penalty.created_at.desc(), Penalty.id.desc())
        .limit(limit).offset(offset)).all()
    return total, unpaid_total, rows
