"""Managed genres (no spelling variants, no clash with categories) and rule-based recommendations."""
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


class Env:
    def __init__(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                               poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine, autoflush=False)
        pw = hash_password("password123")
        with self.Session() as s:
            book = Category(name="Book", type=CategoryType.book, loan_days=7, fine_per_day=5)
            laptop = Category(name="Laptop", type=CategoryType.hardware, loan_days=2, fine_per_day=25)
            kit = Category(name="Arduino Kit", type=CategoryType.hardware, loan_days=3, fine_per_day=20)
            prog, fic, sci = Genre(name="Programming"), Genre(name="Fiction"), Genre(name="Science")
            s.add_all([book, laptop, kit, prog, fic, sci])
            s.add_all([
                User(sr_code="admin", full_name="Admin", email="a@example.com", role=UserRole.admin,
                     status=UserStatus.active, password_hash=pw),
                *[User(sr_code=f"S{i}", full_name=f"Student {i}", email=f"s{i}@example.com",
                       rfid_uid=f"U{i}", status=UserStatus.active, password_hash=pw)
                  for i in range(1, 4)],
            ])
            s.flush()
            mk = lambda tag, name, cat, genre=None, **kw: Equipment(
                rfid_uid=tag, name=name, category=cat, genre=genre, **kw)
            s.add_all([
                mk("P1", "Python Basics", book, prog), mk("P2", "Clean Code", book, prog),
                mk("P3", "Algorithms", book, prog), mk("P4", "Databases", book, prog),
                mk("F1", "Dune", book, fic), mk("F2", "Emma", book, fic),
                mk("C1", "Cosmos", book, sci),
                mk("L1", "Laptop 01", laptop), mk("L2", "Laptop 02", laptop),
                mk("L3", "Laptop 03", laptop), mk("K1", "Arduino Kit 01", kit),
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
        self.admin = self.token("admin")

    def token(self, sr):
        t = self.c.post(("/api/auth/admin/login" if sr == "admin" else "/api/auth/login"), data={"username": sr, "password": "password123"}).json()
        return {"Authorization": f"Bearer {t['access_token']}"}

    def eq(self, tag):
        with self.Session() as s:
            return s.query(Equipment).filter_by(rfid_uid=tag).one().id

    def borrowed(self, sr, tag, days_ago=1, returned=True):
        """Insert a past loan directly, so the test controls how old it is."""
        with self.Session() as s:
            uid = s.query(User).filter_by(sr_code=sr).one().id
            eid = s.query(Equipment).filter_by(rfid_uid=tag).one().id
            when = _now() - timedelta(days=days_ago)
            s.add(Transaction(
                equipment_id=eid, user_id=uid, borrowed_at=when, due_at=when + timedelta(days=3),
                returned_at=when + timedelta(days=1) if returned else None,
                status=TransactionStatus.returned if returned else TransactionStatus.borrowed))
            s.commit()

    def recs(self, sr="S1", **params):
        r = self.c.get("/api/me/recommendations", headers=self.token(sr), params=params)
        assert r.status_code == 200, r.text
        return r.json()


@pytest.fixture
def e():
    env = Env()
    yield env
    app.dependency_overrides.clear()


def names(recs):
    return [i["name"] for i in recs["items"]]


# ---- genres: fixed spelling, no clashes -----------------------------------------------

def test_genre_names_cannot_be_respelled_or_clash_with_categories(e):
    post = lambda n: e.c.post("/api/genres", headers=e.admin, json={"name": n})
    assert post("Science Fiction").status_code == 201
    for variant in ("science fiction", "SCIENCE-FICTION", "  Science  Fiction "):
        assert post(variant).status_code == 409, variant
    assert post("Sci-Fi").status_code == 201            # a different word is a different genre
    assert post("book").status_code == 409              # clashes with the Book category
    assert post("arduino-kit").status_code == 409

    r = e.c.post("/api/categories", headers=e.admin,
                 json={"name": "fiction", "type": "book", "loan_days": 7, "fine_per_day": 5})
    assert r.status_code == 409 and "genre" in r.json()["detail"]
    r = e.c.post("/api/categories", headers=e.admin,
                 json={"name": "laptop", "type": "hardware", "loan_days": 2, "fine_per_day": 5})
    assert r.status_code == 409                          # exact-case rules still apply to categories

    cat = e.c.get("/api/categories", headers=e.admin).json()[0]
    r = e.c.patch(f"/api/categories/{cat['id']}", headers=e.admin, json={"name": "Fiction"})
    assert r.status_code == 409


def test_rename_and_list_genres(e):
    genres = e.c.get("/api/genres", headers=e.token("S1")).json()    # students can read
    assert [g["name"] for g in genres] == ["Fiction", "Programming", "Science"]
    assert {g["name"]: g["book_count"] for g in genres}["Programming"] == 4
    gid = genres[0]["id"]
    assert e.c.patch(f"/api/genres/{gid}", headers=e.admin, json={"name": "Novels"}).json()["name"] == "Novels"
    assert e.c.patch(f"/api/genres/{gid}", headers=e.admin, json={"name": "science"}).status_code == 409
    assert e.c.patch(f"/api/genres/{gid}", headers=e.admin, json={"name": "NOVELS"}).status_code == 200  # own name


def test_only_admins_change_genres(e):
    s1 = e.token("S1")
    assert e.c.post("/api/genres", headers=s1, json={"name": "Poetry"}).status_code == 403
    assert e.c.delete("/api/genres/1", headers=s1).status_code == 403
    assert e.c.get("/api/genres").status_code == 401


def test_delete_genre_in_use_needs_a_decision(e):
    genres = {g["name"]: g["id"] for g in e.c.get("/api/genres", headers=e.admin).json()}
    d = lambda gid, **p: e.c.delete(f"/api/genres/{gid}", headers=e.admin, params=p)
    assert d(genres["Fiction"]).status_code == 409                          # 2 books use it
    assert d(genres["Fiction"], reassign_to=9999).status_code == 404
    r = d(genres["Fiction"], reassign_to=genres["Science"]).json()
    assert r == {"ok": True, "books_moved": 2}
    dune = e.c.get(f"/api/equipment/{e.eq('F1')}", headers=e.admin).json()
    assert dune["genre"] == "Science"

    r = d(genres["Science"], detach="true").json()
    assert r["books_moved"] == 3
    assert e.c.get(f"/api/equipment/{e.eq('F1')}", headers=e.admin).json()["genre"] is None
    unused = e.c.post("/api/genres", headers=e.admin, json={"name": "Poetry"}).json()["id"]
    assert d(unused).json() == {"ok": True, "books_moved": 0}


# ---- genres on equipment --------------------------------------------------------------

def test_equipment_genre_rules(e):
    genres = {g["name"]: g["id"] for g in e.c.get("/api/genres", headers=e.admin).json()}
    cats = {c["name"]: c["id"] for c in e.c.get("/api/categories", headers=e.admin).json()}
    new = lambda **kw: e.c.post("/api/equipment", headers=e.admin,
                                json={"tag_uid": "NEW1234", "name": "New", **kw})

    r = new(category_id=cats["Book"], genre_id=genres["Science"])
    assert r.status_code == 201 and r.json()["genre"] == "Science"
    assert new(category_id=cats["Laptop"], genre_id=genres["Science"]).status_code == 409   # books only
    assert new(category_id=cats["Book"], genre_id=9999).status_code == 404

    item = r.json()["id"]
    patch = lambda **kw: e.c.patch(f"/api/equipment/{item}", headers=e.admin, json=kw)
    assert patch(genre_id=genres["Fiction"]).json()["genre"] == "Fiction"
    assert patch(name="Renamed").json()["genre"] == "Fiction"                # untouched when not sent
    assert patch(genre_id=None).json()["genre"] is None                      # explicit null clears
    patch(genre_id=genres["Fiction"])
    assert patch(category_id=cats["Laptop"]).json()["genre"] is None         # moved out of books
    assert patch(category_id=cats["Laptop"], genre_id=genres["Fiction"]).status_code == 409

    in_fic = e.c.get("/api/equipment", headers=e.admin, params={"genre_id": genres["Fiction"]}).json()
    assert sorted(i["name"] for i in in_fic["items"]) == ["Dune", "Emma"]


# ---- recommendations ------------------------------------------------------------------

def test_recommends_from_favourite_genre_then_category(e):
    for tag in ("P1", "P2", "F1"):                       # mostly Programming, one Fiction
        e.borrowed("S1", tag, days_ago=5)
    e.borrowed("S1", "L1", days_ago=5)
    r = e.recs(limit=10)
    assert r["strategy"] == "history"
    assert [g["name"] for g in r["top_genres"]][0] == "Programming"
    assert r["top_categories"][0]["name"] == "Book" and r["top_categories"][0]["borrows"] == 3
    first = r["items"][0]
    assert first["genre"] == "Programming" and first["reason"] == "Because you often borrow Programming books"
    # P1, P2 and F1 were already read, so they are skipped; unread Programming books lead
    assert not {"Python Basics", "Clean Code", "Dune"} & set(names(r))
    assert {"Algorithms", "Databases"} <= set(names(r)[:2])
    # laptops come from the category the user also borrowed from
    laptop = next(i for i in r["items"] if i["name"].startswith("Laptop"))
    assert laptop["reason"] == "Because you often borrow Laptop"


def test_category_only_history_recommends_hardware_again(e):
    e.borrowed("S1", "L1", days_ago=3)
    e.borrowed("S1", "L1", days_ago=20)
    r = e.recs()
    assert r["items"][0]["name"] in ("Laptop 01", "Laptop 02", "Laptop 03")
    assert "Laptop 01" in names(r)                        # hardware may be borrowed again
    assert r["items"][0]["reason"] == "Because you often borrow Laptop"


def test_variety_cap_and_exclusions(e):
    e.borrowed("S1", "L1", days_ago=2)
    with e.Session() as s:                                # one laptop is out, one is damaged
        s.query(Equipment).filter_by(rfid_uid="L2").one().status = EquipmentStatus.borrowed
        s.query(Equipment).filter_by(rfid_uid="L3").one().condition = EquipmentCondition.damaged
        s.commit()
    r = e.recs()
    assert [n for n in names(r) if n.startswith("Laptop")] == ["Laptop 01"]

    e.borrowed("S2", "P1", days_ago=2)                    # S2 likes Programming: 3 unread, cap is 2
    r = e.recs("S2", limit=10)
    prog = [i for i in r["items"] if i["genre"] == "Programming"]
    assert len(prog) == 2


def test_recent_borrowing_outweighs_old_habits(e):
    for tag in ("F1", "F2"):                              # three Fiction borrows, a year ago
        e.borrowed("S1", tag, days_ago=300)
    e.borrowed("S1", "F1", days_ago=320)
    for tag in ("P1", "P2"):                              # two recent Programming borrows
        e.borrowed("S1", tag, days_ago=4)
    r = e.recs()
    assert r["top_genres"][0]["name"] == "Fiction"        # raw counts still show the old favourite
    assert r["items"][0]["genre"] == "Programming"        # but recency decides what is suggested


def test_new_user_gets_popular_items(e):
    e.borrowed("S2", "C1", days_ago=3); e.borrowed("S3", "C1", days_ago=2); e.borrowed("S2", "L2")
    r = e.recs("S1", limit=3)
    assert r["strategy"] == "popular" and r["top_categories"] == [] and r["top_genres"] == []
    assert names(r)[0] == "Cosmos"                        # most borrowed overall
    assert all(i["reason"] == "Popular with other borrowers" and i["score"] is None for i in r["items"])
    assert len(r["items"]) == 3


def test_history_fills_remaining_slots_with_popular_items(e):
    e.borrowed("S1", "C1", days_ago=3)     # the only Science book is read; other books match by category
    r = e.recs(limit=6)
    assert r["strategy"] == "history"
    reasons = [i["reason"] for i in r["items"]]
    assert reasons[:4] == ["Because you often borrow Book"] * 4        # 2 Programming + 2 Fiction (cap)
    assert reasons[4:] == ["Popular with other borrowers"] * 2         # filler for the remaining slots
    assert len(set(names(r))) == 6


def test_blocked_borrower_is_flagged(e):
    e.borrowed("S1", "P1", days_ago=2)
    assert e.recs()["borrowing_blocked"] is None
    with e.Session() as s:
        tx = s.query(Transaction).one()
        s.add(Penalty(transaction_id=tx.id, user_id=tx.user_id, type=PenaltyType.overdue_fine,
                      amount=50, status=PenaltyStatus.unpaid)); s.commit()
    r = e.recs()
    assert r["borrowing_blocked"] == "unpaid_fine" and r["items"]    # still shown, with the notice


def test_limit_validation_and_auth(e):
    assert e.c.get("/api/me/recommendations").status_code == 401
    h = e.token("S1")
    assert e.c.get("/api/me/recommendations", headers=h, params={"limit": 0}).status_code == 422
    assert e.c.get("/api/me/recommendations", headers=h, params={"limit": 21}).status_code == 422
    assert len(e.recs(limit=1)["items"]) == 1
    assert "rfid_uid" not in str(e.recs()) and "tag_uid" not in str(e.recs())   # tags stay private
