"""The logged-in user's own records (the student's "my items and fines" page)."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PenaltyStatus, Transaction, User
from app.schemas.recommendations import RecommendationsOut
from app.schemas.records import (MySummary, PenaltyListOut, TransactionListOut, TransactionState,
                                 penalty_out, transaction_out)
from app.security import get_current_user
from app.services.borrowing import _now
from app.services.recommendations import recommend
from app.services.records import query_penalties, query_transactions, state_clause

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/transactions", response_model=TransactionListOut)
def my_transactions(state: Optional[TransactionState] = None,
                    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total, rows, now = query_transactions(db, user_id=user.id,
                                          state=state.value if state else None,
                                          limit=limit, offset=offset)
    return TransactionListOut(total=total, items=[transaction_out(t, now) for t in rows])


@router.get("/penalties", response_model=PenaltyListOut)
def my_penalties(status: Optional[PenaltyStatus] = None, limit: int = Query(50, ge=1, le=200),
                 offset: int = Query(0, ge=0), user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    total, unpaid_total, rows = query_penalties(db, user_id=user.id, status=status,
                                                limit=limit, offset=offset)
    return PenaltyListOut(total=total, unpaid_total=unpaid_total,
                          items=[penalty_out(p) for p in rows])


@router.get("/summary", response_model=MySummary)
def my_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = _now()

    def count(state: str) -> int:
        return db.scalar(select(func.count()).select_from(Transaction)
                         .where(and_(Transaction.user_id == user.id, state_clause(state, now))))

    _, unpaid_total, _ = query_penalties(db, user_id=user.id, status=PenaltyStatus.unpaid, limit=1)
    overdue = count("overdue")
    return MySummary(borrowed_now=count("borrowed") + overdue, overdue_now=overdue,
                     unpaid_total=unpaid_total)


@router.get("/recommendations", response_model=RecommendationsOut)
def my_recommendations(limit: int = Query(5, ge=1, le=20), user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    """Items and books suggested from the categories and genres this user borrows most.
    Rule-based (plain counting, no AI); each suggestion says why it was picked."""
    return recommend(db, user, limit)
