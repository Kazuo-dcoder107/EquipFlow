"""Admin actions on equipment that create penalties: mark lost / mark damaged."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Equipment, EquipmentCondition
from app.schemas.records import DamagedIn, IncidentOut, LostIn, penalty_out
from app.security import require_admin
from app.services import penalties

router = APIRouter(prefix="/api/equipment", tags=["penalties"],
                   dependencies=[Depends(require_admin)])

_HTTP = {"already_missing": 409, "no_history": 409, "wrong_item": 409, "no_amount": 422}


def _item(db: Session, equipment_id: int) -> Equipment:
    item = db.get(Equipment, equipment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return item


def _respond(result: penalties.IncidentResult) -> IncidentOut:
    if not result.ok:
        raise HTTPException(status_code=_HTTP[result.code], detail=result.message)
    return IncidentOut(ok=True, message=result.message,
                       penalty=penalty_out(result.penalty) if result.penalty else None)


@router.post("/{equipment_id}/mark-lost", response_model=IncidentOut)
def mark_lost(equipment_id: int, body: LostIn, db: Session = Depends(get_db)):
    """Sets the item to missing. If a borrower has it, they get a 'lost' penalty
    (replacement cost unless an amount is given) and their loan closes as lost."""
    return _respond(penalties.mark_lost(db, _item(db, equipment_id), body.amount, body.notes))


@router.post("/{equipment_id}/mark-damaged", response_model=IncidentOut)
def mark_damaged(equipment_id: int, body: DamagedIn, db: Session = Depends(get_db)):
    """Records the condition and charges the latest borrower (or the given transaction)."""
    return _respond(penalties.mark_damaged(
        db, _item(db, equipment_id), body.amount, EquipmentCondition(body.condition),
        body.notes, body.transaction_id))
