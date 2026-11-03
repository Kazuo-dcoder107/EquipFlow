"""Admin actions that create penalties: lost and damaged items."""
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (Equipment, EquipmentCondition, EquipmentStatus, Penalty, PenaltyStatus,
                        PenaltyType, Transaction, TransactionStatus)


@dataclass
class IncidentResult:
    ok: bool
    code: str
    message: str
    penalty: Optional[Penalty] = None


def _fail(code: str, message: str) -> IncidentResult:
    return IncidentResult(False, code, message)


def mark_lost(db: Session, item: Equipment, amount: Optional[int] = None,
              notes: Optional[str] = None) -> IncidentResult:
    """Item is missing. If someone has it out, they are charged and the loan
    closes as 'lost' (freeing their borrow slot)."""
    if item.status == EquipmentStatus.missing:
        return _fail("already_missing", "Item is already marked missing")
    tx = db.scalar(select(Transaction).where(
        Transaction.equipment_id == item.id, Transaction.returned_at.is_(None),
        Transaction.status != TransactionStatus.lost))
    if tx is None:  # nobody holds it, so there is nobody to charge
        item.status = EquipmentStatus.missing
        db.commit()
        return IncidentResult(True, "ok", "Marked missing (no borrower to charge)")
    charge = amount if amount is not None else item.replacement_cost
    if charge <= 0:
        return _fail("no_amount", "Set a replacement cost on the item or pass an amount")
    tx.status = TransactionStatus.lost
    item.status = EquipmentStatus.missing
    penalty = Penalty(transaction_id=tx.id, user_id=tx.user_id, type=PenaltyType.lost,
                      amount=charge, status=PenaltyStatus.unpaid, notes=notes)
    db.add(penalty)
    db.commit()
    return IncidentResult(True, "ok", "Marked lost and borrower charged", penalty)


def mark_damaged(db: Session, item: Equipment, amount: int, condition: EquipmentCondition,
                 notes: Optional[str] = None,
                 transaction_id: Optional[int] = None) -> IncidentResult:
    """Charge for damage. By default the charge goes to the item's most recent
    borrower (returns are tag-only, so damage is found after the fact)."""
    if transaction_id is not None:
        tx = db.get(Transaction, transaction_id)
        if tx is None or tx.equipment_id != item.id:
            return _fail("wrong_item", "That transaction does not belong to this item")
    else:
        tx = db.scalar(select(Transaction).where(Transaction.equipment_id == item.id)
                       .order_by(Transaction.borrowed_at.desc(), Transaction.id.desc()))
        if tx is None:
            return _fail("no_history", "Item has no borrowing history to charge")
    item.condition = condition
    penalty = Penalty(transaction_id=tx.id, user_id=tx.user_id, type=PenaltyType.damaged,
                      amount=amount, status=PenaltyStatus.unpaid, notes=notes)
    db.add(penalty)
    db.commit()
    return IncidentResult(True, "ok", "Damage recorded and borrower charged", penalty)
