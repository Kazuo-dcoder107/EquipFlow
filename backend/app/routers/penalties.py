"""Penalty list and settlement (admin)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Penalty, PenaltyStatus, PenaltyType
from app.schemas.records import PenaltyListOut, PenaltyOut, PenaltyUpdate, penalty_out
from app.security import require_admin
from app.services.borrowing import _now
from app.services.records import query_penalties

router = APIRouter(prefix="/api/penalties", tags=["penalties"],
                   dependencies=[Depends(require_admin)])


@router.get("", response_model=PenaltyListOut)
def list_penalties(user_id: Optional[int] = None, status: Optional[PenaltyStatus] = None,
                   type: Optional[PenaltyType] = None, search: Optional[str] = None,
                   limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                   db: Session = Depends(get_db)):
    """`unpaid_total` is the unpaid amount within the filtered results."""
    total, unpaid_total, rows = query_penalties(db, user_id=user_id, status=status, type=type,
                                                search=search, limit=limit, offset=offset)
    return PenaltyListOut(total=total, unpaid_total=unpaid_total,
                          items=[penalty_out(p) for p in rows])


@router.patch("/{penalty_id}", response_model=PenaltyOut)
def settle_penalty(penalty_id: int, body: PenaltyUpdate, db: Session = Depends(get_db)):
    """Mark paid or waived (e.g. a lost item turned up), or set back to unpaid to fix a mistake."""
    penalty = db.get(Penalty, penalty_id)
    if penalty is None:
        raise HTTPException(status_code=404, detail="Penalty not found")
    penalty.status = body.status
    penalty.resolved_at = None if body.status == PenaltyStatus.unpaid else _now()
    if body.notes is not None:
        penalty.notes = body.notes
    db.commit()
    return penalty_out(penalty)
