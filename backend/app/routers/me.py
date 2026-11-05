"""The logged-in user's own records (the student's "my items and fines" page)."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PenaltyStatus, Transaction, User
from app.schemas.recommendations import RecommendationsOut
from app.schemas.records import (MySummary, PenaltyListOut, TransactionListOut, TransactionState,
                                 penalty_out, transaction_out)
from app.schemas.users import UserOut
from app.security import get_current_user
from app.services.avatars import MAX_UPLOAD_BYTES, AvatarError, process_avatar
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


# ---- profile photo (kept in the database; see services/avatars.py) ----

@router.get("/avatar")
def get_my_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The logged-in user's photo as a JPEG. Needs the login token, so photos are not public."""
    data = db.scalar(select(User.avatar).where(User.id == user.id))
    if data is None:
        raise HTTPException(status_code=404, detail="No profile photo")
    # The site asks for ?v=<avatar_version>, so each new photo gets its own cache entry.
    return Response(content=data, media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=86400"})


@router.put("/avatar", response_model=UserOut)
async def upload_my_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user),
                           db: Session = Depends(get_db)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)   # never read more than we allow
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That picture is too large (2 MB at most).")
    try:
        user.avatar = process_avatar(data)
    except AvatarError as err:
        raise HTTPException(status_code=422, detail=str(err))
    user.avatar_updated_at = datetime.now(timezone.utc)
    db.commit()
    return UserOut.from_user(user)


@router.delete("/avatar", response_model=UserOut)
def delete_my_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Back to the default picture (the first letter of the name). Safe to repeat."""
    user.avatar = None
    user.avatar_updated_at = None
    db.commit()
    return UserOut.from_user(user)
