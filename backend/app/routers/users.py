"""Admin user management."""
from typing import Optional

import logging

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import ActivityLog, Transaction, User, UserRole, UserStatus
from app.schemas.users import PasswordReset, RejectIn, UserListOut, UserOut, UserUpdate
from app.security import hash_password, require_admin
from app.services.notifications import email_enabled, send_email

router = APIRouter(prefix="/api/users", tags=["users"], dependencies=[Depends(require_admin)])


def _get_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("", response_model=UserListOut)
def list_users(search: Optional[str] = None, status: Optional[UserStatus] = None,
               role: Optional[UserRole] = None, department_id: Optional[int] = None,
               program_id: Optional[int] = None, year_level: Optional[int] = None,
               limit: int = Query(50, ge=1, le=200),
               offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    q = select(User)
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.where(or_(User.sr_code.ilike(like), User.full_name.ilike(like),
                        User.email.ilike(like)))
    if status:
        q = q.where(User.status == status)
    if role:
        q = q.where(User.role == role)
    if department_id is not None:
        q = q.where(User.department_id == department_id)
    if program_id is not None:
        q = q.where(User.program_id == program_id)
    if year_level is not None:
        q = q.where(User.year_level == year_level)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.options(selectinload(User.department), selectinload(User.program))
                      .order_by(User.created_at.desc(), User.id.desc())
                      .limit(limit).offset(offset)).all()
    return UserListOut(total=total, items=[UserOut.from_user(u) for u in rows])


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    return UserOut.from_user(_get_or_404(db, user_id))


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db)):
    user = _get_or_404(db, user_id)
    if body.email and body.email != user.email:
        if db.scalar(select(User.id).where(User.email == body.email)):
            raise HTTPException(status_code=409, detail="Email already registered")
        user.email = body.email
    if body.full_name:
        user.full_name = body.full_name
    db.commit()
    return UserOut.from_user(user)


@router.post("/{user_id}/approve", response_model=UserOut)
def approve_user(user_id: int, db: Session = Depends(get_db)):
    """Approve a teacher/staff sign-up; they can then link their ID tag at the kiosk."""
    user = _get_or_404(db, user_id)
    if user.status != UserStatus.pending_approval:
        raise HTTPException(status_code=409, detail="User is not waiting for approval")
    user.status = UserStatus.pending_enrollment
    db.commit()
    return UserOut.from_user(user)


@router.post("/{user_id}/reject")
def reject_user(user_id: int, body: RejectIn = Body(default_factory=RejectIn),
                db: Session = Depends(get_db)):
    """Reject a teacher/staff sign-up that is waiting for approval. The pending account is
    removed (they can register again with the right details). If email is set up, the person
    is told, with the admin's optional reason."""
    user = _get_or_404(db, user_id)
    if user.status != UserStatus.pending_approval:
        raise HTTPException(status_code=409, detail="User is not waiting for approval")
    emailed = False
    if email_enabled():
        lines = [f"Hello {user.full_name.split()[0]},", "",
                 f"Your EquipFlow registration as {user.role.value} was not approved."]
        if body.reason:
            lines += ["", f"Reason: {body.reason}"]
        lines += ["", "If you think this is a mistake, please contact your administrator, "
                      "or register again with the correct details."]
        try:
            send_email(user.email, "Your EquipFlow registration was not approved", "\n".join(lines))
            emailed = True
        except Exception:   # a mail problem must not block the admin's decision
            logging.getLogger("uvicorn.error").exception("Could not email the rejection notice")
    db.execute(update(ActivityLog).where(ActivityLog.user_id == user.id).values(user_id=None))
    db.delete(user)
    db.commit()
    return {"ok": True, "emailed": emailed}


@router.post("/{user_id}/deactivate-tag", response_model=UserOut)
def deactivate_tag(user_id: int, db: Session = Depends(get_db)):
    """Lost card: the tag stops working at once (the kiosk shows "Tag deactivated")."""
    user = _get_or_404(db, user_id)
    if user.rfid_uid is None:
        raise HTTPException(status_code=409, detail="User has no ID tag linked")
    user.rfid_active = False
    db.commit()
    return UserOut.from_user(user)


@router.post("/{user_id}/reissue-tag", response_model=UserOut)
def reissue_tag(user_id: int, db: Session = Depends(get_db)):
    """Replacement card: unlinks the old tag and sends the user back to the kiosk to
    link the new one. Their borrowing history and any open loans are kept."""
    user = _get_or_404(db, user_id)
    if user.rfid_uid is None:
        raise HTTPException(status_code=409, detail="User has no ID tag linked")
    user.rfid_uid = None
    user.rfid_active = True
    user.status = UserStatus.pending_enrollment
    db.commit()
    return UserOut.from_user(user)


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, body: PasswordReset, db: Session = Depends(get_db)):
    user = _get_or_404(db, user_id)
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """Only accounts that never borrowed anything can be deleted (e.g. fake sign-ups)."""
    user = _get_or_404(db, user_id)
    if user.role == UserRole.admin:
        raise HTTPException(status_code=409, detail="Admin accounts cannot be deleted here")
    has_history = db.scalar(select(func.count()).select_from(Transaction)
                            .where(Transaction.user_id == user.id))
    if has_history:
        raise HTTPException(status_code=409,
                            detail="User has borrowing history and cannot be deleted")
    db.execute(update(ActivityLog).where(ActivityLog.user_id == user.id).values(user_id=None))
    db.delete(user)
    db.commit()
    return {"ok": True}
