"""Borrowing history (admin)."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.records import TransactionListOut, TransactionState, transaction_out
from app.security import require_admin
from app.services.records import query_transactions

router = APIRouter(prefix="/api/transactions", tags=["transactions"],
                   dependencies=[Depends(require_admin)])


@router.get("", response_model=TransactionListOut)
def list_transactions(user_id: Optional[int] = None, equipment_id: Optional[int] = None,
                      state: Optional[TransactionState] = None, search: Optional[str] = None,
                      from_date: Optional[date] = None, to_date: Optional[date] = None,
                      limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                      db: Session = Depends(get_db)):
    """Newest first. `state` is computed live; from_date/to_date filter by borrow day (local time)."""
    total, rows, now = query_transactions(
        db, user_id=user_id, equipment_id=equipment_id,
        state=state.value if state else None, search=search,
        from_date=from_date, to_date=to_date, limit=limit, offset=offset)
    return TransactionListOut(total=total, items=[transaction_out(t, now) for t in rows])
