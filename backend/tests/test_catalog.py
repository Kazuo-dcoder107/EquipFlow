import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403
from app.models.user import utcnow
from app.security import hash_password

KIOSK = {"X-API-Key": "testkey"}


@pytest.fixture
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    with Session() as s:
        s.add_all([
            User(sr_code="admin", full_name="Admin", email="admin@x", role=UserRole.admin,
                 status=UserStatus.active, password_hash=hash_password("adminpass1")),
            User(sr_code="24-0001", full_name="Stu", email="s@x", status=UserStatus.active,
                 rfid_uid="U1", password_hash=hash_password("studentpass1")),
            Kiosk(name="K1", api_key="testkey"),
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

    def hdr(user, pw):
        t = c.post(("/api/auth/admin/login" if user == "admin" else "/api/auth/login"), data={"username": user, "password": pw}).json()["access_token"]
        return {"Authorization": f"Bearer {t}"}

    yield c, Session, hdr("admin", "adminpass1"), hdr("24-0001", "studentpass1")
    app.dependency_overrides.clear()


def mk_cat(c, h, name="Laptop", type="hardware", loan=2, fine=25):
    return c.post("/api/categories", headers=h,
                  json={"name": name, "type": type, "loan_days": loan, "fine_per_day": fine})


def mk_item(c, h, cat_id, tag="04A1B2C3", name="Laptop 01", **extra):
    return c.post("/api/equipment", headers=h,
                  json={"tag_uid": tag, "name": name, "category_id": cat_id, **extra})


def test_category_permissions_and_validation(env):
    c, _, admin, student = env
    assert c.get("/api/categories").status_code == 401
    assert mk_cat(c, student).status_code == 403
    r = mk_cat(c, admin, name="  Laptop ")
    assert r.status_code == 201 and r.json()["name"] == "Laptop" and r.json()["equipment_count"] == 0
    assert mk_cat(c, admin).status_code == 409
    assert mk_cat(c, admin, name="X", loan=0).status_code == 422
    assert mk_cat(c, admin, name="X", fine=-1).status_code == 422
    assert mk_cat(c, admin, name="X", type="bogus").status_code == 422
    assert [x["name"] for x in c.get("/api/categories", headers=student).json()] == ["Laptop"]


def test_category_update_and_delete_rules(env):
    c, _, admin, _ = env
    laptop = mk_cat(c, admin).json()["id"]
    book = mk_cat(c, admin, name="Book", type="book", loan=7, fine=5).json()["id"]
    r = c.patch(f"/api/categories/{laptop}", headers=admin, json={"loan_days": 3, "fine_per_day": 30})
    assert (r.json()["loan_days"], r.json()["fine_per_day"]) == (3, 30)
    assert c.patch(f"/api/categories/{laptop}", headers=admin, json={"name": "Book"}).status_code == 409
    assert c.patch("/api/categories/999", headers=admin, json={"loan_days": 1}).status_code == 404

    mk_item(c, admin, laptop)
    assert c.patch(f"/api/categories/{laptop}", headers=admin, json={"type": "book"}).status_code == 409
    assert c.delete(f"/api/categories/{laptop}", headers=admin).status_code == 409
    assert c.patch(f"/api/categories/{book}", headers=admin, json={"type": "hardware"}).status_code == 200
    assert c.delete(f"/api/categories/{book}", headers=admin).json()["ok"]


def test_equipment_create_normalizes_and_rejects_duplicates(env):
    c, _, admin, student = env
    cat = mk_cat(c, admin).json()["id"]
    assert mk_item(c, student, cat).status_code == 403
    r = mk_item(c, admin, cat, tag="04:a1:b2:c3", replacement_cost=45000)
    assert r.status_code == 201
    body = r.json()
    assert (body["tag_uid"], body["status"], body["condition"], body["type"]) == ("04A1B2C3", "available", "good", "hardware")
    assert mk_item(c, admin, cat, tag="04-a1-b2-c3", name="Dup").status_code == 409
    assert mk_item(c, admin, 999, tag="FFFF0000").status_code == 404
    assert mk_item(c, admin, cat, tag="zz!", name="Bad").status_code == 422
    assert mk_item(c, admin, cat, tag="AB", name="Short").status_code == 422
    assert mk_item(c, admin, cat, tag="FFFF0000", replacement_cost=-5).status_code == 422


def test_students_do_not_see_tag_uid_or_cost(env):
    c, _, admin, student = env
    cat = mk_cat(c, admin).json()["id"]
    iid = mk_item(c, admin, cat, replacement_cost=45000).json()["id"]
    for url in ("/api/equipment", f"/api/equipment/{iid}"):
        data = c.get(url, headers=student).json()
        item = data["items"][0] if "items" in data else data
        assert item["tag_uid"] is None and item["replacement_cost"] is None
        assert item["name"] == "Laptop 01" and item["status"] == "available"
    full = c.get(f"/api/equipment/{iid}", headers=admin).json()
    assert (full["tag_uid"], full["replacement_cost"]) == ("04A1B2C3", 45000)
    assert c.get("/api/equipment").status_code == 401


def test_search_and_filters(env):
    c, Session, admin, student = env
    hw = mk_cat(c, admin).json()["id"]
    bk = mk_cat(c, admin, name="Book", type="book", loan=7, fine=5).json()["id"]
    mk_item(c, admin, hw, tag="AAAA1111", name="Laptop 01")
    mk_item(c, admin, hw, tag="BBBB2222", name="Projector 01", condition="needs_maintenance")
    mk_item(c, admin, bk, tag="CCCC3333", name="Python Book")
    with Session() as s:
        s.query(Equipment).filter_by(rfid_uid="AAAA1111").one().status = EquipmentStatus.borrowed
        s.commit()

    def count(q, h=admin):
        return c.get(f"/api/equipment?{q}", headers=h).json()["total"]

    assert count("") == 3
    assert count("search=laptop") == 1
    assert count("search=bbbb") == 1                 # admin can search by tag
    assert count("search=bbbb", student) == 0        # students cannot
    assert count("search=bb:bb", admin) == 1         # separators ignored
    assert count("status=borrowed") == 1
    assert count(f"category_id={bk}") == 1
    assert count("type=hardware") == 2
    assert count("condition=needs_maintenance") == 1
    assert c.get("/api/equipment?limit=2", headers=admin).json()["items"].__len__() == 2


def test_update_rules(env):
    c, Session, admin, _ = env
    hw = mk_cat(c, admin).json()["id"]
    bk = mk_cat(c, admin, name="Book", type="book", loan=7, fine=5).json()["id"]
    a = mk_item(c, admin, hw, tag="AAAA1111", name="Laptop 01").json()["id"]
    mk_item(c, admin, hw, tag="BBBB2222", name="Laptop 02")

    r = c.patch(f"/api/equipment/{a}", headers=admin,
                json={"name": " Laptop 1 ", "condition": "damaged", "replacement_cost": 50000})
    assert (r.json()["name"], r.json()["condition"], r.json()["replacement_cost"]) == ("Laptop 1", "damaged", 50000)
    assert c.patch(f"/api/equipment/{a}", headers=admin, json={"tag_uid": "bb:bb:22:22"}).status_code == 409
    assert c.patch(f"/api/equipment/{a}", headers=admin, json={"tag_uid": "CCCC3333"}).json()["tag_uid"] == "CCCC3333"
    assert c.patch(f"/api/equipment/{a}", headers=admin, json={"category_id": 999}).status_code == 404
    assert c.patch("/api/equipment/999", headers=admin, json={"name": "x"}).status_code == 404
    assert c.patch(f"/api/equipment/{a}", headers=admin, json={"category_id": bk}).json()["type"] == "book"

    with Session() as s:
        s.get(Equipment, a).status = EquipmentStatus.borrowed
        s.commit()
    assert c.patch(f"/api/equipment/{a}", headers=admin, json={"category_id": hw}).status_code == 409


def test_delete_rules(env):
    c, Session, admin, _ = env
    cat = mk_cat(c, admin).json()["id"]
    used = mk_item(c, admin, cat, tag="AAAA1111", name="Used").json()["id"]
    fresh = mk_item(c, admin, cat, tag="BBBB2222", name="Fresh").json()["id"]
    with Session() as s:
        s.add(Transaction(equipment_id=used, user_id=2, due_at=utcnow()))
        s.add(ActivityLog(equipment_id=fresh, event_type=EventType.scan, result=EventResult.failed))
        s.commit()
    assert c.delete(f"/api/equipment/{used}", headers=admin).status_code == 409
    assert c.delete(f"/api/equipment/{fresh}", headers=admin).json()["ok"]
    assert c.get(f"/api/equipment/{fresh}", headers=admin).status_code == 404
    with Session() as s:
        assert s.query(ActivityLog).filter(ActivityLog.equipment_id.is_(None)).count() == 1


def test_kiosk_accepts_any_tag_format(env):
    c, _, admin, _ = env
    cat = mk_cat(c, admin).json()["id"]
    mk_item(c, admin, cat, tag="04A1B2C3")
    r = c.get("/api/kiosk/equipment/04:a1:b2:c3", headers=KIOSK).json()
    assert r["ok"] and r["name"] == "Laptop 01" and r["requires_agreement"] is True
    assert c.post("/api/kiosk/login", headers=KIOSK, json={"user_uid": "u-1"}).json()["ok"]
    b = c.post("/api/kiosk/borrow", headers=KIOSK, json={"item_uid": "04-a1-b2-c3"}).json()
    assert b["code"] == "agreement_required"   # item was found; hardware needs the agreement
    assert c.post("/api/kiosk/borrow", headers=KIOSK,
                  json={"item_uid": "04:a1:b2:c3", "agreed": True}).json()["ok"]
    assert c.post("/api/kiosk/return", headers=KIOSK, json={"item_uid": "04a1b2c3"}).json()["ok"]
