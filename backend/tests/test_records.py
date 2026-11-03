from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403
from app.security import hash_password
from app.services.borrowing import _now

KIOSK = {"X-API-Key": "testkey"}


class Env:
    def __init__(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                               poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine, autoflush=False)
        with self.Session() as s:
            s.add_all([
                User(sr_code="admin", full_name="Admin", email="admin@x", role=UserRole.admin,
                     status=UserStatus.active, password_hash=hash_password("adminpass1")),
                User(sr_code="24-0001", full_name="Ana Reyes", email="a@x", rfid_uid="U1",
                     status=UserStatus.active, password_hash=hash_password("studentpass1")),
                User(sr_code="24-0002", full_name="Ben Cruz", email="b@x", rfid_uid="U2",
                     status=UserStatus.active, password_hash=hash_password("studentpass2")),
                Kiosk(name="K1", api_key="testkey"),
            ])
            s.commit()

        def override():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override
        self.c = TestClient(app)
        self.admin = self.login("admin", "adminpass1")
        self.ana = self.login("24-0001", "studentpass1")
        self.ben = self.login("24-0002", "studentpass2")
        hw = self.c.post("/api/categories", headers=self.admin, json={
            "name": "Laptop", "type": "hardware", "loan_days": 2, "fine_per_day": 25}).json()["id"]
        bk = self.c.post("/api/categories", headers=self.admin, json={
            "name": "Book", "type": "book", "loan_days": 7, "fine_per_day": 5}).json()["id"]
        self.item("AAAA1111", "Laptop 01", hw, 45000)
        self.item("BBBB2222", "Python Book", bk, 300)
        self.item("CCCC3333", "Java Book", bk, 250)
        self.item("DDDD4444", "Free Book", bk, 0)
        self.ids = {name: i for name, i in self.sess_items()}

    def login(self, user, pw):
        t = self.c.post(("/api/auth/admin/login" if user == "admin" else "/api/auth/login"), data={"username": user, "password": pw}).json()["access_token"]
        return {"Authorization": f"Bearer {t}"}

    def item(self, tag, name, cat, cost):
        r = self.c.post("/api/equipment", headers=self.admin, json={
            "tag_uid": tag, "name": name, "category_id": cat, "replacement_cost": cost})
        assert r.status_code == 201, r.text

    def sess_items(self):
        with self.Session() as s:
            return [(e.rfid_uid, e.id) for e in s.query(Equipment)]

    def borrow(self, tag, user_no, agreed=False):
        """Tap the user's ID tag (U<n>) to log in, then scan the item."""
        self.c.post("/api/kiosk/login", headers=KIOSK, json={"user_uid": f"U{user_no}"})
        return self.c.post("/api/kiosk/borrow", headers=KIOSK,
                           json={"item_uid": tag, "agreed": agreed}).json()

    def ret(self, tag):
        return self.c.post("/api/kiosk/return", headers=KIOSK, json={"item_uid": tag}).json()

    def force_due(self, tag, delta):
        with self.Session() as s:
            for t in s.query(Transaction).filter_by(equipment_id=self.ids[tag], returned_at=None):
                t.due_at = _now() - delta
            s.commit()

    def item_status(self, tag):
        return self.c.get(f"/api/equipment/{self.ids[tag]}", headers=self.admin).json()


@pytest.fixture
def e():
    env = Env()
    yield env
    app.dependency_overrides.clear()


def test_history_filters_and_live_state(e):
    c = e.c
    assert e.borrow("AAAA1111", 1, agreed=True)["ok"]
    assert e.borrow("BBBB2222", 2)["ok"] and e.borrow("CCCC3333", 2)["ok"]
    e.force_due("AAAA1111", timedelta(days=2, hours=3))   # 3 started days late

    assert c.get("/api/transactions", headers=e.ana).status_code == 403
    assert c.get("/api/transactions").status_code == 401
    q = lambda s: c.get(f"/api/transactions?{s}", headers=e.admin).json()
    assert q("")["total"] == 3
    assert q("state=borrowed")["total"] == 2
    over = q("state=overdue")
    assert over["total"] == 1
    row = over["items"][0]
    assert (row["state"], row["fine"], row["equipment_name"], row["sr_code"]) == ("overdue", 75, "Laptop 01", "24-0001")
    assert row["borrowed_at"].endswith("Z") and row["agreement_accepted_at"] is not None
    assert q("search=python")["total"] == 1
    assert q("search=24-0002")["total"] == 2
    assert q("search=ben")["total"] == 2
    assert q(f"equipment_id={e.ids['CCCC3333']}")["total"] == 1
    assert q("limit=2")["items"].__len__() == 2

    today = (_now() + timedelta(hours=8)).date()
    assert q(f"from_date={today}")["total"] == 3
    assert q(f"to_date={today}")["total"] == 3
    assert q(f"to_date={today - timedelta(days=1)}")["total"] == 0
    assert q(f"from_date={today + timedelta(days=1)}")["total"] == 0

    assert e.ret("BBBB2222")["ok"]
    returned = q("state=returned")
    assert returned["total"] == 1 and returned["items"][0]["fine"] == 0


def test_penalty_settlement(e):
    c = e.c
    e.borrow("AAAA1111", 1, agreed=True)
    e.force_due("AAAA1111", timedelta(days=2, hours=3))
    assert e.ret("AAAA1111")["message"] == "Returned. Fine P75"

    assert c.get("/api/penalties", headers=e.ana).status_code == 403
    data = c.get("/api/penalties", headers=e.admin).json()
    assert (data["total"], data["unpaid_total"]) == (1, 75)
    p = data["items"][0]
    assert (p["type"], p["amount"], p["status"], p["sr_code"], p["equipment_name"]) == ("overdue_fine", 75, "unpaid", "24-0001", "Laptop 01")

    r = c.patch(f"/api/penalties/{p['id']}", headers=e.admin, json={"status": "paid", "notes": "Paid at library"}).json()
    assert r["status"] == "paid" and r["resolved_at"].endswith("Z") and r["notes"] == "Paid at library"
    assert c.get("/api/penalties?status=unpaid", headers=e.admin).json()["total"] == 0
    assert c.get("/api/penalties", headers=e.admin).json()["unpaid_total"] == 0
    assert c.patch(f"/api/penalties/{p['id']}", headers=e.admin, json={"status": "unpaid"}).json()["resolved_at"] is None
    assert c.patch(f"/api/penalties/{p['id']}", headers=e.admin, json={"status": "waived"}).json()["status"] == "waived"
    assert c.patch(f"/api/penalties/{p['id']}", headers=e.admin, json={"status": "bogus"}).status_code == 422
    assert c.patch("/api/penalties/999", headers=e.admin, json={"status": "paid"}).status_code == 404
    assert c.get("/api/penalties?search=reyes", headers=e.admin).json()["total"] == 1
    assert c.get("/api/penalties?search=cruz", headers=e.admin).json()["total"] == 0
    assert c.get("/api/penalties?type=lost", headers=e.admin).json()["total"] == 0


def test_mark_lost_charges_borrower_and_frees_slot(e):
    c = e.c
    e.borrow("BBBB2222", 2); e.borrow("CCCC3333", 2)
    assert e.borrow("DDDD4444", 2)["code"] == "limit_reached"
    url = f"/api/equipment/{e.ids['BBBB2222']}/mark-lost"
    assert c.post(url, headers=e.ana, json={}).status_code == 403

    r = c.post(url, headers=e.admin, json={"notes": "Not returned"})
    assert r.status_code == 200
    pen = r.json()["penalty"]
    assert (pen["type"], pen["amount"], pen["status"], pen["sr_code"]) == ("lost", 300, "unpaid", "24-0002")
    assert e.item_status("BBBB2222")["status"] == "missing"
    states = {t["equipment_name"]: t["state"] for t in c.get("/api/transactions", headers=e.admin).json()["items"]}
    assert states["Python Book"] == "lost"
    assert e.borrow("DDDD4444", 2)["code"] == "unpaid_fine"   # blocked until the lost-item fine is settled

    assert c.post(url, headers=e.admin, json={}).status_code == 409   # already missing
    found = e.ret("BBBB2222")                                          # the book turns up
    assert (found["ok"], found["code"]) == (True, "found")
    assert e.item_status("BBBB2222")["status"] == "available"
    assert c.get("/api/penalties?type=lost&status=unpaid", headers=e.admin).json()["total"] == 1  # admin waives manually


def test_mark_lost_edge_cases(e):
    c = e.c
    free = f"/api/equipment/{e.ids['DDDD4444']}/mark-lost"
    e.borrow("DDDD4444", 1)
    assert c.post(free, headers=e.admin, json={}).status_code == 422          # replacement cost is 0
    ok = c.post(free, headers=e.admin, json={"amount": 120})
    assert ok.status_code == 200 and ok.json()["penalty"]["amount"] == 120

    shelf = c.post(f"/api/equipment/{e.ids['CCCC3333']}/mark-lost", headers=e.admin, json={})
    assert shelf.status_code == 200 and shelf.json()["penalty"] is None       # nobody to charge
    assert e.item_status("CCCC3333")["status"] == "missing"
    assert c.post("/api/equipment/999/mark-lost", headers=e.admin, json={}).status_code == 404
    assert c.post(free, headers=e.admin, json={"amount": 0}).status_code == 422


def test_mark_damaged(e):
    c = e.c
    lap = e.ids["AAAA1111"]
    url = f"/api/equipment/{lap}/mark-damaged"
    assert c.post(url, headers=e.admin, json={"amount": 3000}).status_code == 409   # no history yet
    e.borrow("AAAA1111", 1, agreed=True); e.ret("AAAA1111")

    assert c.post(url, headers=e.ana, json={"amount": 3000}).status_code == 403
    assert c.post(url, headers=e.admin, json={"amount": 0}).status_code == 422
    r = c.post(url, headers=e.admin, json={"amount": 3000, "notes": "Cracked screen"})
    pen = r.json()["penalty"]
    assert (pen["type"], pen["amount"], pen["sr_code"], pen["notes"]) == ("damaged", 3000, "24-0001", "Cracked screen")
    assert e.item_status("AAAA1111")["condition"] == "damaged"

    r = c.post(url, headers=e.admin, json={"amount": 500, "condition": "needs_maintenance"})
    assert r.status_code == 200 and e.item_status("AAAA1111")["condition"] == "needs_maintenance"
    assert c.post(url, headers=e.admin, json={"amount": 500, "condition": "good"}).status_code == 422

    e.borrow("BBBB2222", 2)
    other_tx = c.get(f"/api/transactions?equipment_id={e.ids['BBBB2222']}", headers=e.admin).json()["items"][0]["id"]
    assert c.post(url, headers=e.admin, json={"amount": 500, "transaction_id": other_tx}).status_code == 409
    assert c.post(url, headers=e.admin, json={"amount": 500, "transaction_id": 999}).status_code == 409


def test_my_records_are_private(e):
    c = e.c
    e.borrow("AAAA1111", 1, agreed=True)
    e.borrow("BBBB2222", 2)
    e.force_due("AAAA1111", timedelta(days=2, hours=3))

    mine = c.get("/api/me/transactions", headers=e.ana).json()
    assert mine["total"] == 1 and mine["items"][0]["equipment_name"] == "Laptop 01"
    assert c.get("/api/me/summary", headers=e.ana).json() == {"borrowed_now": 1, "overdue_now": 1, "unpaid_total": 0}
    assert c.get("/api/me/summary", headers=e.ben).json() == {"borrowed_now": 1, "overdue_now": 0, "unpaid_total": 0}

    e.ret("AAAA1111")
    assert c.get("/api/me/summary", headers=e.ana).json() == {"borrowed_now": 0, "overdue_now": 0, "unpaid_total": 75}
    pens = c.get("/api/me/penalties", headers=e.ana).json()
    assert (pens["total"], pens["unpaid_total"], pens["items"][0]["amount"]) == (1, 75, 75)
    assert c.get("/api/me/penalties", headers=e.ben).json()["total"] == 0
    assert c.get("/api/me/transactions?state=returned", headers=e.ana).json()["total"] == 1
    assert c.get("/api/me/transactions?state=returned", headers=e.ben).json()["total"] == 0
    assert c.get("/api/me/summary").status_code == 401
    assert c.get("/api/me/transactions", headers=e.admin).json()["total"] == 0   # admin sees their own (none)
