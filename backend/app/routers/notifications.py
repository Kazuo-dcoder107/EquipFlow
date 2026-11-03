"""Notification history, manual run, and an SMTP test (admin)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (Notification, NotificationStatus, NotificationType, Transaction, User,
                        UserRole)
from app.schemas.notifications import (NotificationListOut, RunOut, TestEmailIn, TestEmailOut,
                                       notification_out)
from app.security import get_current_user, require_admin
from app.services import notifications as svc
from app.services.overdue import sync_overdue

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListOut)
def list_notifications(user_id: Optional[int] = None, type: Optional[NotificationType] = None,
                       status: Optional[NotificationStatus] = None,
                       limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admins see everyone's emails; students see only their own."""
    q = select(Notification)
    if user.role == UserRole.admin:
        if user_id:
            q = q.where(Notification.user_id == user_id)
    else:
        q = q.where(Notification.user_id == user.id)
    if type:
        q = q.where(Notification.type == type)
    if status:
        q = q.where(Notification.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(
        q.options(selectinload(Notification.transaction).selectinload(Transaction.equipment),
                  selectinload(Notification.transaction).selectinload(Transaction.user))
        .order_by(Notification.sent_at.desc(), Notification.id.desc())
        .limit(limit).offset(offset)).all()
    return NotificationListOut(total=total, items=[notification_out(n) for n in rows])


@router.post("/run", response_model=RunOut, dependencies=[Depends(require_admin)])
def run_now(db: Session = Depends(get_db)):
    """Run the overdue refresh and reminder check right now (the scheduler does this on a timer)."""
    sync_overdue(db)
    if not svc.email_enabled():
        return RunOut(email_configured=False)
    s = svc.run_notifications(db)
    return RunOut(email_configured=True, near_due_sent=s.near_due_sent,
                  overdue_sent=s.overdue_sent, failed=s.failed)


@router.post("/test-email", response_model=TestEmailOut)
def test_email(body: Optional[TestEmailIn] = None, admin: User = Depends(require_admin)):
    """Send a test message to check the SMTP settings (default: to the admin's own address)."""
    if not svc.email_enabled():
        raise HTTPException(status_code=409,
                            detail="Email is not configured. Set SMTP_USER and SMTP_PASSWORD in .env")
    to = (body.to if body and body.to else admin.email)
    try:
        svc.send_email(to, "Test email from the borrowing system",
                       "If you can read this, email notifications are set up correctly.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not send: {type(exc).__name__}: {exc}")
    return TestEmailOut(ok=True, sent_to=to)
