import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403

H = {"X-API-Key": "testkey"}


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    with Session() as s:
        book = Category(name="Book", type=CategoryType.book, loan_days=7, fine_per_day=5)
        hw = Category(name="Laptop", type=CategoryType.hardware, loan_days=2, fine_per_day=25)
        s.add_all([
            Kiosk(name="K1", api_key="testkey"), book, hw,
            User(sr_code="A", full_name="A", email="a@x", rfid_uid="U1", status=UserStatus.active),
            User(sr_code="P1", full_name="Pending One", email="p1@x"),
            User(sr_code="P2", full_name="Pending Two", email="p2@x"),
            Equipment(rfid_uid="L1", name="Laptop 1", category=hw),
            Equipment(rfid_uid="B1", name="Book 1", category=book),
        ])
        s.commit()

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_api_key_required(client):
    assert client.get("/api/kiosk/pending-users").status_code == 401
    assert client.get("/api/kiosk/pending-users", headers={"X-API-Key": "bad"}).status_code == 401
    assert client.post("/api/kiosk/heartbeat", headers=H).json()["ok"] is True


def test_pending_users(client):
    users = client.get("/api/kiosk/pending-users", headers=H).json()["users"]
    assert [u["sr_code"] for u in users] == ["P1", "P2"]


def test_enroll_flow(client):
    def enroll(sr, uid):
        return client.post("/api/kiosk/enroll", headers=H,
                           json={"sr_code": sr, "user_uid": uid}).json()

    assert enroll("NOPE", "U9")["code"] == "unknown_user"
    assert enroll("P1", "U1")["code"] == "tag_taken"           # already someone's ID tag
    assert enroll("P1", "L1")["code"] == "wrong_tag_type"      # that is an item tag
    assert enroll("P1", "u-2")["ok"] is True                   # any tag format is accepted
    assert enroll("P1", "U3")["code"] == "already_enrolled"
    users = client.get("/api/kiosk/pending-users", headers=H).json()["users"]
    assert [u["sr_code"] for u in users] == ["P2"]


def test_equipment_lookup(client):
    hw = client.get("/api/kiosk/equipment/L1", headers=H).json()
    assert (hw["ok"], hw["type"], hw["loan_days"], hw["requires_agreement"]) == (True, "hardware", 2, True)
    assert client.get("/api/kiosk/equipment/B1", headers=H).json()["requires_agreement"] is False
    assert client.get("/api/kiosk/equipment/NOPE", headers=H).json()["code"] == "unknown_item"


def test_borrow_and_return(client):
    assert client.post("/api/kiosk/login", headers=H, json={"user_uid": "U1"}).json()["ok"]
    body = {"item_uid": "L1"}
    assert client.post("/api/kiosk/borrow", headers=H, json=body).json()["code"] == "agreement_required"
    r = client.post("/api/kiosk/borrow", headers=H, json={**body, "agreed": True}).json()
    assert r["ok"] and r["due_at"] is not None
    assert client.get("/api/kiosk/equipment/L1", headers=H).json()["status"] == "borrowed"
    r = client.post("/api/kiosk/return", headers=H, json={"item_uid": "L1"}).json()
    assert (r["ok"], r["fine"]) == (True, 0)
    assert client.post("/api/kiosk/return", headers=H, json={"item_uid": "L1"}).json()["code"] == "not_borrowed"
