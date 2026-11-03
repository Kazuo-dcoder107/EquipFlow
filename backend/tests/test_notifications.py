from datetime import timedelta

import pytest

from app.main import app
from app.models import *  # noqa: F401,F403
from app.services.borrowing import _now
from app.services.notifications import run_notifications
from tests.test_records import Env


class Outbox:
    def __init__(self):
        self.sent, self.fail = [], False

    def __call__(self, to, subject, body):
        if self.fail:
            raise RuntimeError("smtp down")
        self.sent.append((to, subject, body))


@pytest.fixture
def e():
    env = Env()
    yield env
    app.dependency_overrides.clear()


def set_times(e, tag, borrowed_ago, due_in):
    """Place the open loan of `tag` at known times relative to now (due_in < 0 = overdue)."""
    now = _now()
    with e.Session() as s:
        for t in s.query(Transaction).filter_by(equipment_id=e.ids[tag], returned_at=None):
            t.borrowed_at, t.due_at = now - borrowed_ago, now + due_in
        s.commit()
    return now


def run(e, outbox, **kw):
    with e.Session() as s:
        return run_notifications(s, send=outbox, **kw)


def rows(e):
    with e.Session() as s:
        return [(n.type, n.status) for n in s.query(Notification).order_by(Notification.id)]


def test_near_due_is_sent_once(e):
    box = Outbox()
    e.borrow("BBBB2222", 2)                                           # Ben, book, 7-day loan
    now = set_times(e, "BBBB2222", timedelta(days=6), timedelta(hours=5))
    s = run(e, box, now=now)
    assert (s.near_due_sent, s.overdue_sent, s.failed) == (1, 0, 0)
    to, subject, body = box.sent[0]
    assert to == "b@x" and "Python Book" in subject and "due soon" in subject
    assert "Ben" in body and "P5 per day" in body
    assert run(e, box, now=now + timedelta(hours=1)).near_due_sent == 0   # no duplicate
    assert rows(e) == [(NotificationType.near_due, NotificationStatus.sent)]


def test_no_reminder_when_not_yet_due_soon_or_loan_shorter_than_window(e):
    box = Outbox()
    e.borrow("BBBB2222", 2)                                           # due in 7 days
    assert run(e, box).near_due_sent == 0                              # outside the 24h window
    assert run(e, box, near_due_hours=24 * 10).near_due_sent == 0      # loan (7d) shorter than window
    assert box.sent == []


def test_overdue_first_notice_then_daily_reminders(e):
    box = Outbox()
    e.borrow("AAAA1111", 1, agreed=True)                               # Ana, laptop, P25/day
    now = set_times(e, "AAAA1111", timedelta(days=4), -timedelta(days=2, hours=3))
    s = run(e, box, now=now)
    assert (s.overdue_sent, s.failed) == (1, 0)
    to, subject, body = box.sent[0]
    assert to == "a@x" and "Overdue" in subject and "P75" in subject
    assert "Days overdue: 3" in body and "Fine so far: P75 (P25 per day)" in body

    assert run(e, box, now=now + timedelta(hours=1)).overdue_sent == 0      # too soon
    s = run(e, box, now=now + timedelta(hours=25))                          # a day later: reminder
    assert s.overdue_sent == 1 and "Fine so far: P100" in box.sent[1][2]
    assert run(e, box, now=now + timedelta(hours=100), overdue_reminder_days=0).overdue_sent == 0
    assert len(rows(e)) == 2


def test_failed_send_is_recorded_and_retried(e):
    e.borrow("AAAA1111", 1, agreed=True)
    now = set_times(e, "AAAA1111", timedelta(days=4), -timedelta(days=1))
    box = Outbox(); box.fail = True
    s = run(e, box, now=now)
    assert (s.failed, s.overdue_sent) == (1, 0) and box.sent == []
    box.fail = False
    s = run(e, box, now=now + timedelta(minutes=30))                        # next run retries
    assert (s.failed, s.overdue_sent) == (0, 1)
    assert rows(e) == [(NotificationType.overdue, NotificationStatus.failed),
                       (NotificationType.overdue, NotificationStatus.sent)]


def test_returned_and_lost_loans_get_no_email(e):
    box = Outbox()
    e.borrow("BBBB2222", 2); e.borrow("CCCC3333", 2)
    now = set_times(e, "BBBB2222", timedelta(days=9), -timedelta(days=2))
    set_times(e, "CCCC3333", timedelta(days=9), -timedelta(days=2))
    assert e.ret("BBBB2222")["ok"]
    e.c.post(f"/api/equipment/{e.ids['CCCC3333']}/mark-lost", headers=e.admin, json={})
    assert run(e, box, now=now).overdue_sent == 0 and box.sent == []


def test_endpoints(e, monkeypatch):
    c, box = e.c, Outbox()
    assert c.post("/api/notifications/run").status_code == 401
    assert c.post("/api/notifications/run", headers=e.ana).status_code == 403
    assert c.post("/api/notifications/test-email", headers=e.ana).status_code == 403

    # email not configured: nothing is sent or recorded, and the admin is told
    assert c.post("/api/notifications/run", headers=e.admin).json() == {
        "email_configured": False, "near_due_sent": 0, "overdue_sent": 0, "failed": 0}
    assert c.post("/api/notifications/test-email", headers=e.admin).status_code == 409

    monkeypatch.setattr("app.services.notifications.email_enabled", lambda: True)
    monkeypatch.setattr("app.services.notifications.send_email", box)
    e.borrow("AAAA1111", 1, agreed=True)
    set_times(e, "AAAA1111", timedelta(days=4), -timedelta(days=1))
    assert c.post("/api/notifications/run", headers=e.admin).json() == {
        "email_configured": True, "near_due_sent": 0, "overdue_sent": 1, "failed": 0}
    assert box.sent[0][0] == "a@x"

    r = c.get("/api/notifications", headers=e.admin).json()
    assert r["total"] == 1
    n = r["items"][0]
    assert (n["sr_code"], n["equipment_name"], n["type"], n["status"]) == ("24-0001", "Laptop 01", "overdue", "sent")
    assert n["sent_at"].endswith("Z")
    assert c.get("/api/notifications?type=near_due", headers=e.admin).json()["total"] == 0
    assert c.get("/api/notifications?status=failed", headers=e.admin).json()["total"] == 0
    assert c.get("/api/notifications", headers=e.ana).json()["total"] == 1       # her own
    assert c.get("/api/notifications", headers=e.ben).json()["total"] == 0       # not hers
    assert c.get(f"/api/notifications?user_id=2", headers=e.ben).json()["total"] == 0  # filter can't leak
    assert c.get("/api/notifications").status_code == 401

    # SMTP test endpoint
    assert c.post("/api/notifications/test-email", headers=e.admin).json() == {"ok": True, "sent_to": "admin@x"}
    r = c.post("/api/notifications/test-email", headers=e.admin, json={"to": "me@example.com"})
    assert r.json()["sent_to"] == "me@example.com" and box.sent[-1][0] == "me@example.com"
    assert c.post("/api/notifications/test-email", headers=e.admin, json={"to": "nope"}).status_code == 422
    box.fail = True
    r = c.post("/api/notifications/test-email", headers=e.admin)
    assert r.status_code == 502 and "smtp down" in r.json()["detail"]


def test_scheduler_registers_the_job():
    from app.scheduler import build_scheduler
    jobs = build_scheduler().get_jobs()
    assert [j.id for j in jobs] == ["notifications"]
