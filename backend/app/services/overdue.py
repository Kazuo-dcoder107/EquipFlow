from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EquipmentStatus, Transaction, TransactionStatus
from app.services.borrowing import _now
from app.services.records import state_clause


def sync_overdue(db: Session) -> int:
    """Flag loans that are past due: transaction and equipment status become 'overdue'.
    Idempotent and cheap, so it runs whenever statuses are read (dashboard, equipment
    list) and will also run on a schedule. Returns how many rows were changed."""
    txs = db.scalars(select(Transaction).where(state_clause("overdue", _now()))).all()
    changed = 0
    for tx in txs:
        if tx.status != TransactionStatus.overdue:
            tx.status = TransactionStatus.overdue
            changed += 1
        if tx.equipment.status == EquipmentStatus.borrowed:
            tx.equipment.status = EquipmentStatus.overdue
            changed += 1
    if changed:
        db.commit()
    return changed
