"""RFID-only design: tag detection, kiosk sessions, blocking rule, teacher/staff, lost cards."""
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
from app.services import sessions
from app.services.borrowing import _now
from tests.school import STUDENT_PROFILE, seed_school

K = {"X-API-Key": "testkey"}


class Env:
    def __init__(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                               poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine, autoflush=False)
        seed_school(self.Session)
        with self.Session() as s:
            book = Category(name="Book", type=CategoryType.book, loan_days=3, fine_per_day=5)
            hw = Category(name="Laptop", type=CategoryType.hardware, loan_days=2, fine_per_day=25)
            pw = hash_password("password123")
            s.add_all([
                Kiosk(name="K1", api_key="testkey"), book, hw,
                User(sr_code="admin", full_name="Admin", email="adm@x", role=UserRole.admin,
                     status=UserStatus.active, password_hash=pw),
                User(sr_code="S1", full_name="Stu Dent", email="s@x", rfid_uid="US",
                     status=UserStatus.active, password_hash=pw),
                User(sr_code="T1", full_name="Tess Teacher", email="t@x", role=UserRole.teacher,
                     rfid_uid="UT", status=UserStatus.active, password_hash=pw),
                User(sr_code="F1", full_name="Stan Staff", email="f@x", role=UserRole.staff,
                     rfid_uid="UF", status=UserStatus.active, password_hash=pw),
                *[Equipment(rfid_uid=f"B{i}", name=f"Book {i}", category=book, replacement_cost=100)
                  for i in range(1, 7)],
                Equipment(rfid_uid="L1", name="Laptop 1", category=hw),
                Equipment(rfid_uid="L2", name="Laptop 2", category=hw),
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
        token = self.c.post("/api/auth/admin/login",
                            data={"username": "admin", "password": "password123"}).json()["access_token"]
        self.admin = {"Authorization": f"Bearer {token}"}

    def login(self, uid):
        return self.c.post("/api/kiosk/login", headers=K, json={"user_uid": uid}).json()

    def borrow(self, uid, agreed=False):
        return self.c.post("/api/kiosk/borrow", headers=K,
                           json={"item_uid": uid, "agreed": agreed}).json()

    def ret(self, uid):
        return self.c.post("/api/kiosk/return", headers=K, json={"item_uid": uid}).json()

    def user_id(self, sr):
        with self.Session() as s:
            return s.query(User).filter_by(sr_code=sr).one().id


@pytest.fixture
def e():
    env = Env()
    yield env
    app.dependency_overrides.clear()


# ---- tag detection and alerts ---------------------------------------------------------

def test_scan_tells_user_item_and_unknown_tags_apart(e):
    scan = lambda uid: e.c.get(f"/api/kiosk/scan/{uid}", headers=K).json()
    u = scan("us")
    assert (u["ok"], u["kind"], u["name"], u["role"]) == (True, "user", "Stu Dent", "student")
    i = scan("L1")
    assert (i["ok"], i["kind"], i["type"], i["requires_agreement"]) == (True, "item", "hardware", True)
    assert (scan("ZZ")["ok"], scan("ZZ")["code"]) == (False, "unknown_tag")


def test_wrong_tag_type_alerts(e):
    assert e.login("L1")["code"] == "wrong_tag_type"          # item tapped as ID
    assert e.login("NOPE")["code"] == "unknown_tag"
    assert e.login("US")["ok"]
    assert e.borrow("UT")["code"] == "wrong_tag_type"          # ID card scanned as an item
    assert e.borrow("NOPE")["code"] == "unknown_item"
    assert e.ret("UT")["code"] == "wrong_tag_type"
    assert e.ret("NOPE")["code"] == "unknown_item"


def test_admin_cannot_register_an_item_with_an_id_tag(e):
    with e.Session() as s:
        s.add(User(sr_code="N0", full_name="Long Uid", email="n0@x", rfid_uid="04A1B2C3D4",
                   status=UserStatus.active)); s.commit()
    r = e.c.post("/api/equipment", headers=e.admin,
                 json={"tag_uid": "04-a1-b2-c3-d4", "name": "Oops", "category_id": 1})
    assert r.status_code == 409


# ---- login session ----------------------------------------------------------------------

def test_borrow_needs_login_and_session_expires(e, monkeypatch):
    assert e.borrow("B1")["code"] == "no_session"
    ok = e.login("US")
    assert ok["ok"] and ok["name"] == "Stu Dent" and ok["session_seconds"] == 30
    assert e.borrow("B1")["ok"]

    now = [1000.0]
    monkeypatch.setattr(sessions, "_clock", lambda: now[0])
    e.login("US")
    now[0] += 29
    assert e.borrow("B2")["ok"]            # activity refreshes the timeout
    now[0] += 31
    assert e.borrow("B3")["code"] == "no_session"


def test_logout_ends_session_and_login_switches_user(e):
    e.login("US")
    e.c.post("/api/kiosk/logout", headers=K)
    assert e.borrow("B1")["code"] == "no_session"
    e.login("US"); e.login("UT")           # next person taps in
    assert e.borrow("B1")["ok"]
    with e.Session() as s:
        assert s.query(Transaction).one().user_id == e.user_id("T1")


def test_return_needs_no_login(e):
    e.login("US"); assert e.borrow("B1")["ok"]
    e.c.post("/api/kiosk/logout", headers=K)
    assert e.ret("B1")["ok"]


# ---- blocking rule ----------------------------------------------------------------------

def test_unpaid_fine_blocks_until_paid_or_waived(e):
    e.login("US")
    assert e.borrow("L1", agreed=True)["ok"]
    with e.Session() as s:                  # make it 3 days late (rounded up)
        t = s.query(Transaction).one(); t.due_at = _now() - timedelta(days=2, hours=12); s.commit()
    assert e.borrow("B1")["code"] == "has_overdue"          # overdue loan blocks
    r = e.ret("L1")
    assert r["ok"] and r["fine"] == 75
    assert e.borrow("B1")["code"] == "unpaid_fine"           # returned, but the fine is unpaid
    pid = e.c.get("/api/penalties", headers=e.admin).json()["items"][0]["id"]
    e.c.patch(f"/api/penalties/{pid}", headers=e.admin, json={"status": "waived"})
    assert e.borrow("B1")["ok"]                               # waived fines no longer block


def test_blocked_user_can_still_return(e):
    e.login("US"); assert e.borrow("B1")["ok"]
    with e.Session() as s:
        t = s.query(Transaction).one(); t.due_at = _now() - timedelta(days=1); s.commit()
    assert e.borrow("B2")["code"] == "has_overdue"
    assert e.ret("B1")["ok"]


def test_login_reports_when_borrowing_is_blocked(e):
    assert e.login("US")["borrowing_blocked"] is None
    assert e.borrow("L1", agreed=True)["ok"]
    with e.Session() as s:                  # 3 days late (rounded up)
        t = s.query(Transaction).one(); t.due_at = _now() - timedelta(days=2, hours=12); s.commit()
    r = e.login("US")
    assert r["ok"] and r["borrowing_blocked"] == "has_overdue"     # can log in, told up front
    assert e.ret("L1")["ok"]                                      # and can still return
    assert e.login("US")["borrowing_blocked"] == "unpaid_fine"    # returned, fine unpaid
    pid = e.c.get("/api/penalties", headers=e.admin).json()["items"][0]["id"]
    e.c.patch(f"/api/penalties/{pid}", headers=e.admin, json={"status": "waived"})
    assert e.login("US")["borrowing_blocked"] is None


def test_failed_login_has_no_blocked_field_set(e):
    r = e.login("NOPE")
    assert r["ok"] is False and r["borrowing_blocked"] is None


def test_scan_keeps_a_logged_in_session_alive(e, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(sessions, "_clock", lambda: now[0])

    e.login("US")
    now[0] += 20
    assert e.c.get("/api/kiosk/scan/B1", headers=K).json()["kind"] == "item"
    now[0] += 20                            # 40 s since login, but only 20 s since the scan
    assert e.borrow("B1")["ok"]

    e.login("US")                           # control: with no scan the same gap ends the session
    now[0] += 40
    assert e.borrow("B2")["code"] == "no_session"


def test_scan_never_opens_a_session(e):
    e.c.get("/api/kiosk/scan/B1", headers=K)
    assert e.borrow("B1")["code"] == "no_session"


# ---- teacher / staff rules --------------------------------------------------------------

def due_days(e):
    with e.Session() as s:
        t = s.query(Transaction).order_by(Transaction.id.desc()).first()
        return round((t.due_at - t.borrowed_at).total_seconds() / 86400)


def test_students_keep_category_loan_and_two_book_limit(e):
    e.login("US")
    assert e.borrow("B1")["ok"] and due_days(e) == 3
    assert e.borrow("B2")["ok"]
    assert e.borrow("B3")["code"] == "limit_reached"


@pytest.mark.parametrize("tag", ["UT", "UF"])
def test_teacher_and_staff_get_one_week_and_four_books(e, tag):
    e.login(tag)
    assert e.borrow("B1")["ok"] and due_days(e) == 7
    for b in ("B2", "B3", "B4"):
        assert e.borrow(b)["ok"]
    assert e.borrow("B5")["code"] == "limit_reached"


def test_teacher_hardware_rules_match_students(e):
    e.login("UT")
    assert e.borrow("L1", agreed=True)["ok"] and due_days(e) == 2     # category loan days
    assert e.borrow("L2", agreed=True)["code"] == "limit_reached"     # still one at a time
    assert e.borrow("B1")["code"] == "limit_reached"                  # and no mixing


def test_teacher_fine_is_the_category_rate(e):
    e.login("UT"); assert e.borrow("B1")["ok"]
    with e.Session() as s:
        t = s.query(Transaction).one(); t.due_at = _now() - timedelta(days=1, hours=12); s.commit()
    assert e.ret("B1")["fine"] == 10      # 2 days x P5


# ---- registration, approval, lost cards -------------------------------------------------

def register(e, sr, role=None):
    body = {"sr_code": sr, "full_name": "New Person", "email": f"{sr.lower()}@example.com", "password": "password123"}
    if role:
        body["role"] = role
    if role in (None, "student"):
        body.update(STUDENT_PROFILE)   # students must give age, department, year level and program
    return e.c.post("/api/auth/register", json=body)


def test_student_registration_is_unchanged(e):
    r = register(e, "N1")
    assert r.status_code == 201
    assert (r.json()["role"], r.json()["status"], r.json()["rfid_linked"]) == ("student", "pending_enrollment", False)


def test_teacher_signup_waits_for_approval_then_links_a_tag(e):
    r = register(e, "N2", "teacher")
    assert r.status_code == 201 and r.json()["status"] == "pending_approval"
    uid = r.json()["id"]
    assert "N2" not in [u["sr_code"] for u in e.c.get("/api/kiosk/pending-users", headers=K).json()["users"]]
    link = lambda: e.c.post("/api/kiosk/enroll", headers=K, json={"sr_code": "N2", "user_uid": "tag-n2"}).json()
    assert link()["code"] == "not_approved"

    assert e.c.post(f"/api/users/{uid}/approve", headers=e.admin).json()["status"] == "pending_enrollment"
    assert e.c.post(f"/api/users/{uid}/approve", headers=e.admin).status_code == 409
    assert "N2" in [u["sr_code"] for u in e.c.get("/api/kiosk/pending-users", headers=K).json()["users"]]
    assert link()["ok"]
    login = e.login("TAGN2")
    assert login["ok"] and login["role"] == "teacher"


def test_nobody_can_register_as_admin(e):
    assert register(e, "N3", "admin").status_code == 422
    assert register(e, "N4", "bogus").status_code == 422


def test_login_blocked_while_awaiting_approval(e):
    with e.Session() as s:
        s.add(User(sr_code="N5", full_name="Wait", email="n5@x", role=UserRole.staff, rfid_uid="UN5",
                   status=UserStatus.pending_approval)); s.commit()
    assert e.login("UN5")["code"] == "not_approved"


def test_lost_card_deactivate_then_reissue(e):
    sid = e.user_id("S1")
    assert e.login("US")["ok"]
    r = e.c.post(f"/api/users/{sid}/deactivate-tag", headers=e.admin).json()
    assert (r["rfid_linked"], r["rfid_active"]) == (True, False)
    assert e.login("US")["code"] == "tag_deactivated"
    assert e.c.get("/api/kiosk/scan/US", headers=K).json()["code"] == "tag_deactivated"

    # a session opened before the card was reported lost cannot keep borrowing
    sessions.open_session(1, sid)
    assert e.borrow("B1")["code"] == "tag_deactivated"

    r = e.c.post(f"/api/users/{sid}/reissue-tag", headers=e.admin).json()
    assert (r["rfid_linked"], r["rfid_active"], r["status"]) == (False, True, "pending_enrollment")
    assert e.login("US")["code"] == "unknown_tag"              # old card is dead for good
    assert e.c.post("/api/kiosk/enroll", headers=K,
                    json={"sr_code": "S1", "user_uid": "new-card"}).json()["ok"]
    assert e.login("NEWCARD")["ok"]


def test_tag_endpoints_need_a_linked_tag_and_admin(e):
    nobody = register(e, "N6").json()["id"]
    assert e.c.post(f"/api/users/{nobody}/deactivate-tag", headers=e.admin).status_code == 409
    assert e.c.post(f"/api/users/{nobody}/reissue-tag", headers=e.admin).status_code == 409
    assert e.c.post(f"/api/users/{nobody}/approve").status_code == 401
