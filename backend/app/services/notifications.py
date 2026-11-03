"""Near-due and overdue reminder emails.

Each (loan, kind) is emailed once; overdue reminders repeat every OVERDUE_REMINDER_DAYS.
Every attempt is recorded in `notifications`, so nobody gets duplicates and failures are visible.
"""
import logging
import math
import smtplib
from dataclasses import dataclass
from datetime import datetime, timedelta
from email.message import EmailMessage
from typing import Callable, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import (LOCAL_UTC_OFFSET_HOURS, NEAR_DUE_HOURS, OVERDUE_REMINDER_DAYS, SMTP_FROM,
                        SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_SECURITY, SMTP_USER)
from app.models import (Equipment, Notification, NotificationStatus, NotificationType,
                        Transaction, TransactionStatus)
from app.services.borrowing import _now
from app.services.records import fine_for

log = logging.getLogger("uvicorn.error")


@dataclass
class RunSummary:
    near_due_sent: int = 0
    overdue_sent: int = 0
    failed: int = 0


def email_enabled() -> bool:
    return bool(SMTP_USER and SMTP_PASSWORD)


def send_email(to: str, subject: str, body: str) -> None:
    """Send one plain-text email over SMTP. Raises on any failure."""
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = SMTP_FROM, to, subject
    msg.set_content(body)
    smtp_class = smtplib.SMTP_SSL if SMTP_SECURITY == "ssl" else smtplib.SMTP
    with smtp_class(SMTP_HOST, SMTP_PORT, timeout=15) as server:
        if SMTP_SECURITY != "ssl":
            server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)


def _local(d: datetime) -> str:
    return (d + timedelta(hours=LOCAL_UTC_OFFSET_HOURS)).strftime("%b %d, %Y %I:%M %p")


def build_message(kind: NotificationType, tx: Transaction, now: datetime):
    item, rate = tx.equipment.name, tx.equipment.category.fine_per_day
    first = tx.user.full_name.split()[0] if tx.user.full_name.strip() else "there"
    footer = "\nThank you,\nSchool Equipment Borrowing System\n"
    if kind == NotificationType.near_due:
        subject = f"Reminder: '{item}' is due soon"
        body = (f"Hi {first},\n\nThis is a reminder that an item you borrowed is due soon.\n\n"
                f"  Item: {item}\n  Due: {_local(tx.due_at)}\n\n"
                f"Please return it on or before the due date. Late returns are charged P{rate} per day.\n"
                + footer)
    else:
        days = math.ceil((now - tx.due_at).total_seconds() / 86400)
        fine = fine_for(tx, now)
        subject = f"Overdue: '{item}' - fine so far P{fine}"
        body = (f"Hi {first},\n\nAn item you borrowed is overdue.\n\n"
                f"  Item: {item}\n  Was due: {_local(tx.due_at)}\n  Days overdue: {days}\n"
                f"  Fine so far: P{fine} (P{rate} per day)\n\n"
                "Please return it as soon as possible. The fine grows each day until it is returned. "
                "If the item is lost or damaged, you will be asked to pay for its replacement or repair.\n"
                + footer)
    return subject, body


def run_notifications(db: Session, send: Optional[Callable[[str, str, str], None]] = None,
                      now: Optional[datetime] = None, near_due_hours: Optional[int] = None,
                      overdue_reminder_days: Optional[int] = None) -> RunSummary:
    send = send or send_email
    now = now or _now()
    window = timedelta(hours=NEAR_DUE_HOURS if near_due_hours is None else near_due_hours)
    repeat_days = OVERDUE_REMINDER_DAYS if overdue_reminder_days is None else overdue_reminder_days

    last_sent = {(tid, kind): ts for tid, kind, ts in db.execute(
        select(Notification.transaction_id, Notification.type, func.max(Notification.sent_at))
        .where(Notification.status == NotificationStatus.sent)
        .group_by(Notification.transaction_id, Notification.type))}

    loans = db.scalars(
        select(Transaction)
        .where(Transaction.returned_at.is_(None), Transaction.status != TransactionStatus.lost)
        .options(selectinload(Transaction.equipment).selectinload(Equipment.category),
                 selectinload(Transaction.user))).all()

    summary = RunSummary()
    for tx in loans:
        remaining = tx.due_at - now
        kind = None
        if remaining > timedelta(0):
            # Only for loans longer than the window; otherwise the reminder would fire
            # right after borrowing.
            if (remaining <= window and (tx.due_at - tx.borrowed_at) > window
                    and (tx.id, NotificationType.near_due) not in last_sent):
                kind = NotificationType.near_due
        else:
            prev = last_sent.get((tx.id, NotificationType.overdue))
            if prev is None or (repeat_days > 0 and now - prev >= timedelta(days=repeat_days)):
                kind = NotificationType.overdue
        if kind is None:
            continue

        subject, body = build_message(kind, tx, now)
        status = NotificationStatus.sent
        try:
            send(tx.user.email, subject, body)
        except Exception as exc:  # one bad address or SMTP hiccup must not stop the run
            log.warning("Email to %s failed: %s: %s", tx.user.email, type(exc).__name__, exc)
            status = NotificationStatus.failed
        db.add(Notification(user_id=tx.user_id, transaction_id=tx.id, type=kind,
                            status=status, sent_at=now))
        db.commit()  # record each attempt immediately so a crash can't cause a resend
        if status == NotificationStatus.failed:
            summary.failed += 1
        elif kind == NotificationType.near_due:
            summary.near_due_sent += 1
        else:
            summary.overdue_sent += 1
    return summary
