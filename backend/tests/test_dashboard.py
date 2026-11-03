from datetime import datetime, timedelta

import pytest

from app.main import app
from app.models import *  # noqa: F401,F403
from tests.test_records import Env


@pytest.fixture
def e():
    env = Env()
    yield env
    app.dependency_overrides.clear()


def stats(e):
    return e.c.get("/api/dashboard/stats", headers=e.admin).json()


def test_dashboard_is_admin_only(e):
    assert e.c.get("/api/dashboard/stats").status_code == 401
    assert e.c.get("/api/dashboard/stats", headers=e.ana).status_code == 403
    assert e.c.get("/api/reports/usage").status_code == 401
    assert e.c.get("/api/reports/usage", headers=e.ana).status_code == 403


def test_dashboard_counts_follow_the_borrowing_flow(e):
    c = e.c
    c.post("/api/auth/register", json={"sr_code": "24-0003", "full_name": "New Kid",
                                       "email": "n@x.com", "password": "password123"})
    s = stats(e)
    assert s["equipment"] == {"total": 4, "available": 4, "borrowed": 0, "overdue": 0, "missing": 0}
    assert s["users"] == {"students": 3, "enrolled": 2, "pending_enrollment": 1,
                          "pending_approval": 0}
    assert s["today"] == {"borrows": 0, "returns": 0} and s["overdue_items"] == []

    assert e.borrow("AAAA1111", 1, agreed=True)["ok"]
    assert e.borrow("BBBB2222", 2)["ok"] and e.borrow("CCCC3333", 2)["ok"]
    s = stats(e)
    assert (s["equipment"]["borrowed"], s["equipment"]["available"]) == (3, 1)
    assert s["today"]["borrows"] == 3

    e.force_due("AAAA1111", timedelta(days=2, hours=3))
    s = stats(e)
    assert (s["equipment"]["borrowed"], s["equipment"]["overdue"]) == (2, 1)
    item = s["overdue_items"][0]
    assert (item["equipment_name"], item["sr_code"], item["days_overdue"], item["fine"]) == ("Laptop 01", "24-0001", 3, 75)
    assert item["due_at"].endswith("Z")

    assert e.ret("BBBB2222")["ok"]
    assert e.ret("AAAA1111")["message"] == "Returned. Fine P75"
    s = stats(e)
    assert s["today"] == {"borrows": 3, "returns": 2}
    assert s["penalties"] == {"unpaid_count": 1, "unpaid_total": 75}
    assert (s["equipment"]["available"], s["equipment"]["borrowed"], s["equipment"]["overdue"]) == (3, 1, 0)

    e.c.post(f"/api/equipment/{e.ids['CCCC3333']}/mark-lost", headers=e.admin, json={})
    assert stats(e)["equipment"]["missing"] == 1


def test_overdue_status_is_current_when_reading_equipment(e):
    e.borrow("AAAA1111", 1, agreed=True)
    e.force_due("AAAA1111", timedelta(hours=1))
    # no scheduler has run, yet the equipment list already shows the right status
    items = e.c.get("/api/equipment?status=overdue", headers=e.ana).json()
    assert items["total"] == 1 and items["items"][0]["name"] == "Laptop 01"
    assert e.item_status("AAAA1111")["status"] == "overdue"
    assert e.ret("AAAA1111")["ok"]
    assert e.item_status("AAAA1111")["status"] == "available"


def add_tx(e, tag, user_id, borrowed, due, returned=None):
    with e.Session() as s:
        s.add(Transaction(equipment_id=e.ids[tag], user_id=user_id, borrowed_at=borrowed, due_at=due,
                          returned_at=returned, status=TransactionStatus.returned if returned else TransactionStatus.borrowed))
        s.commit()


def seed_history(e):
    d = datetime
    # Laptop: 4 loans, 3 returned late.  (times are UTC; local = UTC+8)
    add_tx(e, "AAAA1111", 2, d(2026, 9, 7, 2), d(2026, 9, 9, 2), d(2026, 9, 9, 1))     # Mon 10:00, on time
    add_tx(e, "AAAA1111", 3, d(2026, 9, 8, 2), d(2026, 9, 10, 2), d(2026, 9, 12, 2))   # Tue 10:00, late
    add_tx(e, "AAAA1111", 3, d(2026, 9, 14, 2), d(2026, 9, 16, 2), d(2026, 9, 18, 2))  # Mon 10:00, late
    add_tx(e, "AAAA1111", 2, d(2026, 9, 21, 6), d(2026, 9, 23, 6), d(2026, 9, 26, 6))  # Mon 14:00, late
    # Python Book: 2 loans on time
    add_tx(e, "BBBB2222", 2, d(2026, 9, 7, 14), d(2026, 9, 14, 14), d(2026, 9, 10, 14))  # Mon 22:00
    add_tx(e, "BBBB2222", 3, d(2026, 9, 15, 2), d(2026, 9, 22, 2), d(2026, 9, 16, 2))    # Tue 10:00
    # Java Book: still out and long overdue
    add_tx(e, "CCCC3333", 3, d(2026, 9, 1, 2), d(2026, 9, 8, 2))                        # Tue 10:00


def test_usage_report(e):
    seed_history(e)
    r = e.c.get("/api/reports/usage", headers=e.admin).json()

    assert r["summary"]["total_borrows"] == 7 and r["summary"]["returned"] == 6
    assert r["summary"]["returned_late"] == 3 and r["summary"]["on_time_rate"] == 50.0
    assert abs(r["summary"]["avg_loan_days"] - 3.16) < 0.01

    assert [(m["name"], m["borrow_count"]) for m in r["most_borrowed"]] == [("Laptop 01", 4), ("Python Book", 2), ("Java Book", 1)]
    fo = r["frequently_overdue"]
    assert [(m["name"], m["late_count"], m["late_rate"]) for m in fo] == [("Laptop 01", 3, 75.0), ("Java Book", 1, 100.0)]

    hours = {h["hour"]: h["count"] for h in r["by_hour"]}
    assert len(r["by_hour"]) == 24 and sum(hours.values()) == 7
    assert (hours[10], hours[14], hours[22]) == (5, 1, 1)           # local time, not UTC
    days = {d["weekday"]: d["count"] for d in r["by_weekday"]}
    assert [d["weekday"] for d in r["by_weekday"]] == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    assert (days["Mon"], days["Tue"], days["Wed"]) == (4, 3, 0)

    cats = {c["name"]: c for c in r["by_category"]}
    assert cats["Laptop"]["borrow_count"] == 4 and cats["Book"]["borrow_count"] == 3
    assert abs(cats["Laptop"]["avg_loan_days"] - 3.74) < 0.01        # (1.96 + 4 + 4 + 5) / 4
    assert cats["Book"]["avg_loan_days"] == 2.0                      # (3 + 1) / 2

    assert e.c.get("/api/reports/usage?top=1", headers=e.admin).json()["most_borrowed"].__len__() == 1


def test_usage_report_date_range(e):
    seed_history(e)
    r = e.c.get("/api/reports/usage?from_date=2026-09-15&to_date=2026-09-30", headers=e.admin).json()
    assert r["period"] == {"from_date": "2026-09-15", "to_date": "2026-09-30"}
    assert r["summary"]["total_borrows"] == 2                         # Sep 15 Python Book + Sep 21 Laptop
    assert {m["name"] for m in r["most_borrowed"]} == {"Laptop 01", "Python Book"}
    empty = e.c.get("/api/reports/usage?from_date=2030-01-01", headers=e.admin).json()
    assert empty["summary"]["total_borrows"] == 0 and empty["summary"]["on_time_rate"] is None
    assert empty["most_borrowed"] == [] and sum(h["count"] for h in empty["by_hour"]) == 0


def test_maintenance_flags(e):
    seed_history(e)
    url = f"/api/equipment/{e.ids['AAAA1111']}/mark-damaged"
    for amount in (500, 800):
        assert e.c.post(url, headers=e.admin, json={"amount": amount, "condition": "needs_maintenance"}).status_code == 200
    e.c.patch(f"/api/equipment/{e.ids['DDDD4444']}", headers=e.admin, json={"condition": "damaged"})

    flags = e.c.get("/api/reports/usage?heavy_use_threshold=3", headers=e.admin).json()["maintenance"]
    assert [f["name"] for f in flags] == ["Laptop 01", "Free Book"]    # most reasons first
    laptop = flags[0]
    assert laptop["reasons"] == ["needs_maintenance", "repeated_damage", "heavy_use"]
    assert (laptop["total_borrows"], laptop["damage_reports"]) == (4, 2)
    assert flags[1]["reasons"] == ["damaged"]

    default = e.c.get("/api/reports/usage", headers=e.admin).json()["maintenance"]
    assert "heavy_use" not in default[0]["reasons"]                    # default threshold is 30 borrows
