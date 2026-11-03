"""Two web sites, one API: separate logins, CORS allowlist, rejecting role sign-ups."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403
from app.routers import users as users_router
from app.security import hash_password

PW = "password123"
BORROWER_SITE, ADMIN_SITE = "http://localhost:3000", "http://localhost:3001"


@pytest.fixture
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    pw = hash_password(PW)
    with Session() as s:
        s.add_all([
            User(sr_code="admin", full_name="Admin", email="admin@example.com", role=UserRole.admin,
                 status=UserStatus.active, password_hash=pw),
            User(sr_code="S1", full_name="Stu Dent", email="s1@example.com", rfid_uid="US1",
                 status=UserStatus.active, password_hash=pw),
            User(sr_code="T1", full_name="Tess Teacher", email="t1@example.com", role=UserRole.teacher,
                 status=UserStatus.pending_approval, password_hash=pw),
            User(sr_code="F1", full_name="Stan Staff", email="f1@example.com", role=UserRole.staff,
                 status=UserStatus.pending_approval, password_hash=pw),
            User(sr_code="S2", full_name="New Student", email="s2@example.com",
                 status=UserStatus.pending_enrollment, password_hash=pw),
        ])
        s.commit()

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    c = TestClient(app)
    yield c, Session
    app.dependency_overrides.clear()


def login(c, path, user, pw=PW):
    return c.post(path, data={"username": user, "password": pw})


def bearer(c, path, user):
    return {"Authorization": f"Bearer {login(c, path, user).json()['access_token']}"}


def uid(Session, sr):
    with Session() as s:
        u = s.query(User).filter_by(sr_code=sr).first()
        return u.id if u else None


# ---- separate logins ------------------------------------------------------------------

def test_admin_site_accepts_only_admins(env):
    c, _ = env
    ok = login(c, "/api/auth/admin/login", "admin")
    assert ok.status_code == 200 and ok.json()["role"] == "admin"
    wrong_pw = login(c, "/api/auth/admin/login", "admin", "nope")
    for sr in ("S1", "T1", "ghost"):                       # a borrower, a pending teacher, nobody
        r = login(c, "/api/auth/admin/login", sr)
        assert r.status_code == 401
        assert r.json() == wrong_pw.json()                 # same answer as a wrong password


def test_borrower_site_refuses_admins(env):
    c, _ = env
    assert login(c, "/api/auth/login", "S1").json()["role"] == "student"
    wrong_pw = login(c, "/api/auth/login", "S1", "nope")
    r = login(c, "/api/auth/login", "admin")
    assert r.status_code == 401 and r.json() == wrong_pw.json()


def test_tokens_only_open_their_own_side(env):
    c, _ = env
    admin = bearer(c, "/api/auth/admin/login", "admin")
    student = bearer(c, "/api/auth/login", "S1")
    assert c.get("/api/users", headers=admin).status_code == 200
    assert c.get("/api/users", headers=student).status_code == 403
    assert c.get("/api/me/summary", headers=student).status_code == 200


# ---- CORS: only the two sites may call the API from a browser --------------------------

@pytest.mark.parametrize("origin", [BORROWER_SITE, ADMIN_SITE])
def test_cors_allows_the_two_sites(env, origin):
    c, _ = env
    r = c.options("/api/auth/login", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-credentials" not in r.headers


def test_cors_blocks_other_sites(env):
    c, _ = env
    r = c.options("/api/auth/login", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers
    r = c.get("/api/genres", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers


# ---- rejecting role sign-ups ------------------------------------------------------------

@pytest.fixture
def mail(monkeypatch):
    sent = []
    monkeypatch.setattr(users_router, "email_enabled", lambda: True)
    monkeypatch.setattr(users_router, "send_email", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


def test_reject_removes_the_pending_signup_and_emails_the_reason(env, mail):
    c, Session = env
    admin = bearer(c, "/api/auth/admin/login", "admin")
    tid = uid(Session, "T1")
    r = c.post(f"/api/users/{tid}/reject", headers=admin, json={"reason": "  We could not verify you  "})
    assert r.json() == {"ok": True, "emailed": True}
    assert uid(Session, "T1") is None
    to, subject, body = mail[0]
    assert to == "t1@example.com" and "not approved" in subject
    assert "teacher" in body and "Reason: We could not verify you" in body
    assert login(c, "/api/auth/login", "T1").status_code == 401           # account is gone
    reg = c.post("/api/auth/register", json={"sr_code": "T1", "full_name": "Tess Teacher",
                                             "email": "t1@example.com", "password": PW, "role": "teacher"})
    assert reg.status_code == 201                                         # they can apply again


def test_reject_without_a_reason_or_body(env, mail):
    c, Session = env
    admin = bearer(c, "/api/auth/admin/login", "admin")
    assert c.post(f"/api/users/{uid(Session, 'F1')}/reject", headers=admin).json()["emailed"] is True
    assert "Reason:" not in mail[0][2]


def test_reject_still_works_when_email_is_off_or_fails(env, monkeypatch):
    c, Session = env
    admin = bearer(c, "/api/auth/admin/login", "admin")
    monkeypatch.setattr(users_router, "email_enabled", lambda: False)
    r = c.post(f"/api/users/{uid(Session, 'T1')}/reject", headers=admin)
    assert r.json() == {"ok": True, "emailed": False}

    def boom(*a):
        raise RuntimeError("smtp down")
    monkeypatch.setattr(users_router, "email_enabled", lambda: True)
    monkeypatch.setattr(users_router, "send_email", boom)
    r = c.post(f"/api/users/{uid(Session, 'F1')}/reject", headers=admin)
    assert r.json() == {"ok": True, "emailed": False} and uid(Session, "F1") is None


def test_only_pending_approvals_can_be_rejected(env, mail):
    c, Session = env
    admin = bearer(c, "/api/auth/admin/login", "admin")
    for sr in ("S1", "S2", "admin"):    # active, pending tag link, and an admin
        assert c.post(f"/api/users/{uid(Session, sr)}/reject", headers=admin).status_code == 409
        assert uid(Session, sr) is not None
    assert c.post("/api/users/9999/reject", headers=admin).status_code == 404
    assert mail == []


def test_reject_needs_an_admin(env):
    c, Session = env
    tid = uid(Session, "T1")
    assert c.post(f"/api/users/{tid}/reject").status_code == 401
    student = bearer(c, "/api/auth/login", "S1")
    assert c.post(f"/api/users/{tid}/reject", headers=student).status_code == 403
    assert uid(Session, "T1") == tid


def test_the_approval_queue_lists_requested_roles(env):
    c, _ = env
    admin = bearer(c, "/api/auth/admin/login", "admin")
    q = c.get("/api/users", headers=admin, params={"status": "pending_approval"}).json()
    assert q["total"] == 2
    assert {(u["sr_code"], u["role"]) for u in q["items"]} == {("T1", "teacher"), ("F1", "staff")}
    assert all(u["email"] and u["full_name"] and u["created_at"] for u in q["items"])
