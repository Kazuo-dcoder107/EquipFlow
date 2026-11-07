import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403
from app.security import hash_password
from tests.school import STUDENT_PROFILE, seed_school

REG = {"sr_code": "24-0001", "full_name": "Juan Cruz", "email": "Juan@Example.com",
       "password": "secret123", **STUDENT_PROFILE}


@pytest.fixture
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    seed_school(Session)
    with Session() as s:
        s.add(User(sr_code="admin", full_name="Admin", email="admin@x", role=UserRole.admin,
                   status=UserStatus.active, password_hash=hash_password("adminpass1")))
        s.commit()

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    yield TestClient(app), Session
    app.dependency_overrides.clear()


def login(client, user, pw):
    return client.post(("/api/auth/admin/login" if user == "admin" else "/api/auth/login"), data={"username": user, "password": pw})


def auth(client, user, pw):
    return {"Authorization": f"Bearer {login(client, user, pw).json()['access_token']}"}


def test_register_validation_and_duplicates(env):
    c, _ = env
    r = c.post("/api/auth/register", json=REG)
    assert r.status_code == 201
    body = r.json()
    assert (body["status"], body["role"], body["email"]) == ("pending_enrollment", "student", "juan@example.com")
    assert "password" not in body and "password_hash" not in body
    assert c.post("/api/auth/register", json=REG).status_code == 409
    assert c.post("/api/auth/register", json={**REG, "sr_code": "24-0002"}).status_code == 409  # same email
    assert c.post("/api/auth/register", json={**REG, "sr_code": "9", "email": "n@x.com", "password": "short"}).status_code == 422
    assert c.post("/api/auth/register", json={**REG, "sr_code": "9", "email": "bad"}).status_code == 422


def test_login_and_me(env):
    c, _ = env
    c.post("/api/auth/register", json=REG)
    r = login(c, "24-0001", "secret123")
    assert r.status_code == 200 and r.json()["role"] == "student"
    assert login(c, "admin", "adminpass1").json()["role"] == "admin"
    assert login(c, "24-0001", "wrong").status_code == 401
    assert login(c, "nobody", "secret123").status_code == 401
    assert c.get("/api/auth/me").status_code == 401
    assert c.get("/api/auth/me", headers=auth(c, "24-0001", "secret123")).json()["sr_code"] == "24-0001"
    assert c.get("/api/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_users_endpoints_are_admin_only(env):
    c, _ = env
    c.post("/api/auth/register", json=REG)
    assert c.get("/api/users").status_code == 401
    assert c.get("/api/users", headers=auth(c, "24-0001", "secret123")).status_code == 403


def test_list_search_filter(env):
    c, _ = env
    for i, name in enumerate(["Juan Cruz", "Maria Santos", "Pedro Cruz"]):
        c.post("/api/auth/register", json={**REG, "sr_code": f"24-10{i}", "full_name": name,
                                           "email": f"u{i}@x.com"})
    h = auth(c, "admin", "adminpass1")
    assert c.get("/api/users", headers=h).json()["total"] == 4
    assert c.get("/api/users?search=cruz", headers=h).json()["total"] == 2
    assert c.get("/api/users?role=admin", headers=h).json()["total"] == 1
    assert c.get("/api/users?status=pending_enrollment", headers=h).json()["total"] == 3
    assert c.get("/api/users?limit=2&offset=0", headers=h).json()["items"].__len__() == 2


def test_update_and_reset_password(env):
    c, _ = env
    uid = c.post("/api/auth/register", json=REG).json()["id"]
    c.post("/api/auth/register", json={**REG, "sr_code": "24-0002", "email": "other@x.com"})
    h = auth(c, "admin", "adminpass1")
    r = c.patch(f"/api/users/{uid}", headers=h, json={"full_name": "  Juan D. Cruz ", "email": "new@x.com"})
    assert (r.json()["full_name"], r.json()["email"]) == ("Juan D. Cruz", "new@x.com")
    assert c.patch(f"/api/users/{uid}", headers=h, json={"email": "other@x.com"}).status_code == 409
    assert c.patch("/api/users/999", headers=h, json={"full_name": "x"}).status_code == 404

    assert c.post(f"/api/users/{uid}/reset-password", headers=h, json={"new_password": "short"}).status_code == 422
    assert c.post(f"/api/users/{uid}/reset-password", headers=h, json={"new_password": "brandnew99"}).json()["ok"]
    assert login(c, "24-0001", "secret123").status_code == 401
    assert login(c, "24-0001", "brandnew99").status_code == 200


def test_delete_rules(env):
    c, Session = env
    fake = c.post("/api/auth/register", json=REG).json()["id"]
    used = c.post("/api/auth/register", json={**REG, "sr_code": "24-0002", "email": "b@x.com"}).json()["id"]
    with Session() as s:
        cat = Category(name="Book", type=CategoryType.book, loan_days=7, fine_per_day=5)
        eq = Equipment(rfid_uid="B1", name="Book 1", category=cat)
        s.add_all([cat, eq]); s.flush()
        from app.models.user import utcnow
        s.add(Transaction(equipment_id=eq.id, user_id=used, due_at=utcnow()))
        s.add(ActivityLog(user_id=fake, event_type=EventType.enroll, result=EventResult.failed))
        s.commit()
    h = auth(c, "admin", "adminpass1")
    admin_id = c.get("/api/auth/me", headers=h).json()["id"]

    assert c.delete(f"/api/users/{used}", headers=h).status_code == 409      # has history
    assert c.delete(f"/api/users/{admin_id}", headers=h).status_code == 409  # admin
    assert c.delete(f"/api/users/{fake}", headers=h).json()["ok"]            # fake sign-up, its log is kept
    assert c.get(f"/api/users/{fake}", headers=h).status_code == 404
    with Session() as s:
        assert s.query(ActivityLog).filter(ActivityLog.user_id.is_(None)).count() == 1
