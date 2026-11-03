"""Background job: refresh overdue statuses and send reminder emails on a timer.

Run the API with a single worker (the default `uvicorn app.main:app`); several workers
would each start their own scheduler.
"""
import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import NOTIFY_INTERVAL_MINUTES
from app.database import SessionLocal
from app.services.notifications import email_enabled, run_notifications
from app.services.overdue import sync_overdue

log = logging.getLogger("uvicorn.error")


def run_job() -> None:
    try:
        with SessionLocal() as db:
            sync_overdue(db)
            if email_enabled():
                s = run_notifications(db)
                if s.near_due_sent or s.overdue_sent or s.failed:
                    log.info("Notifications: %d near-due, %d overdue, %d failed",
                             s.near_due_sent, s.overdue_sent, s.failed)
    except Exception:
        log.exception("Notification job failed")  # keep the scheduler alive


def build_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler()
    scheduler.add_job(run_job, "interval", minutes=NOTIFY_INTERVAL_MINUTES, id="notifications",
                      next_run_time=datetime.now(), max_instances=1, coalesce=True)
    return scheduler
