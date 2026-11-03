from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.models import (CategoryType, EquipmentCondition, Penalty, PenaltyStatus, PenaltyType,
                        Transaction)
from app.schemas.common import UtcDatetime
from app.services.records import effective_status, fine_for


class TransactionState(str, Enum):
    borrowed = "borrowed"
    overdue = "overdue"
    returned = "returned"
    lost = "lost"


class TransactionOut(BaseModel):
    id: int
    equipment_id: int
    equipment_name: str
    category: str
    type: CategoryType
    user_id: int
    sr_code: str
    full_name: str
    borrowed_at: UtcDatetime
    due_at: UtcDatetime
    returned_at: Optional[UtcDatetime] = None
    state: TransactionState
    fine: int  # pesos: live while out, final once returned, 0 if lost
    agreement_accepted_at: Optional[UtcDatetime] = None
    condition_on_return: Optional[EquipmentCondition] = None


class TransactionListOut(BaseModel):
    total: int
    items: List[TransactionOut]


class PenaltyOut(BaseModel):
    id: int
    transaction_id: int
    user_id: int
    sr_code: str
    full_name: str
    equipment_name: str
    type: PenaltyType
    amount: int
    status: PenaltyStatus
    notes: Optional[str] = None
    created_at: UtcDatetime
    resolved_at: Optional[UtcDatetime] = None


class PenaltyListOut(BaseModel):
    total: int
    unpaid_total: int
    items: List[PenaltyOut]


class PenaltyUpdate(BaseModel):
    status: PenaltyStatus
    notes: Optional[str] = Field(default=None, max_length=255)


class LostIn(BaseModel):
    amount: Optional[int] = Field(default=None, ge=1, le=1_000_000)  # default: replacement cost
    notes: Optional[str] = Field(default=None, max_length=255)


class DamagedIn(BaseModel):
    amount: int = Field(ge=1, le=1_000_000)
    condition: Literal["damaged", "needs_maintenance"] = "damaged"
    notes: Optional[str] = Field(default=None, max_length=255)
    transaction_id: Optional[int] = None  # default: the item's latest borrower


class IncidentOut(BaseModel):
    ok: bool
    message: str
    penalty: Optional[PenaltyOut] = None


class MySummary(BaseModel):
    borrowed_now: int
    overdue_now: int
    unpaid_total: int


def transaction_out(tx: Transaction, now) -> TransactionOut:
    return TransactionOut(
        id=tx.id, equipment_id=tx.equipment_id, equipment_name=tx.equipment.name,
        category=tx.equipment.category.name, type=tx.equipment.category.type,
        user_id=tx.user_id, sr_code=tx.user.sr_code, full_name=tx.user.full_name,
        borrowed_at=tx.borrowed_at, due_at=tx.due_at, returned_at=tx.returned_at,
        state=effective_status(tx, now), fine=fine_for(tx, now),
        agreement_accepted_at=tx.agreement_accepted_at,
        condition_on_return=tx.condition_on_return)


def penalty_out(p: Penalty) -> PenaltyOut:
    tx = p.transaction
    return PenaltyOut(
        id=p.id, transaction_id=p.transaction_id, user_id=p.user_id, sr_code=tx.user.sr_code,
        full_name=tx.user.full_name, equipment_name=tx.equipment.name, type=p.type,
        amount=p.amount, status=p.status, notes=p.notes, created_at=p.created_at,
        resolved_at=p.resolved_at)
