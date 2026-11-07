"""Age / department / year level / program: rules, managed program list, registration, browsing."""
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403
from app.security import hash_password
from app.services.profile import DEPARTMENT_NAMES, bootstrap_school_structure
from tests.school import STUDENT_PROFILE, seed_school

PW = "password123"


@pytest.fixture
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    seed_school(Session)
    pw = hash_password(PW)
    with Session() as s:
        s.add_all([
            User(sr_code="admin", full_name="Admin", email="admin@example.com", role=UserRole.admin,
                 status=UserStatus.active, password_hash=pw),
            User(sr_code="S1", full_name="Stu Dent", email="s1@example.com", status=UserStatus.active, password_hash=pw),
            User(sr_code="T1", full_name="Tess Teacher", email="t1@example.com", role=UserRole.teacher,
                 status=UserStatus.active, password_hash=pw),
            User(sr_code="F1", full_name="Stan Staff", email="f1@example.com", role=UserRole.staff,
                 status=UserStatus.active, password_hash=pw),
        ])
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


def login(c, sr):
    path = "/api/auth/admin/login" if sr == "admin" else "/api/auth/login"
    return {"Authorization": f"Bearer {c.post(path, data={'username': sr, 'password': PW}).json()['access_token']}"}


def ids(c):
    """{department name: id} and {program name: id}."""
    depts = c.get("/api/departments").json()
    return ({d["name"]: d["id"] for d in depts},
            {p["name"]: p["id"] for d in depts for p in d["programs"]})


# ---- the department and program lists --------------------------------------------------

def test_the_five_departments_exist_and_anyone_can_read_them(env):
    c, _ = env
    r = c.get("/api/departments")                      # no login needed (the sign-up form uses it)
    assert r.status_code == 200
    by_name = {d["name"]: d for d in r.json()}
    assert list(by_name) == DEPARTMENT_NAMES == ["CICS", "CAFAD", "CET", "COE", "General Service"]
    assert "Bachelor of Science in Information Technology" in [p["name"] for p in by_name["CICS"]["programs"]]
    assert by_name["General Service"]["programs"] == []


def test_the_first_start_creates_them_once_and_never_again(env):
    c, Session = env
    with Session() as db:
        assert bootstrap_school_structure(db) is False          # already there
        db.execute(Program.__table__.delete())                   # an admin removed every program...
        db.commit()
        assert bootstrap_school_structure(db) is False           # ...and they are NOT brought back
        assert db.query(Program).count() == 0


# ---- the student's profile --------------------------------------------------------------

def test_a_student_must_give_all_four_details(env):
    c, _ = env
    h = login(c, "S1")
    assert c.get("/api/auth/me", headers=h).json()["profile_complete"] is False   # nothing filled in yet

    r = c.put("/api/me/profile", headers=h, json={})
    assert r.status_code == 422
    for needed in ("Age is required", "Department is required", "Year level is required", "Program is required"):
        assert needed in r.json()["detail"]
    r = c.put("/api/me/profile", headers=h, json={"age": 20, "department_id": 1})
    assert r.status_code == 422 and "Year level is required" in r.json()["detail"]

    r = c.put("/api/me/profile", headers=h, json=STUDENT_PROFILE)
    assert r.status_code == 200
    me = r.json()
    assert (me["age"], me["department"], me["year_level"]) == (20, "CICS", 1)
    assert me["program"] == "Bachelor of Science in Information Technology" and me["profile_complete"] is True
    assert c.get("/api/auth/me", headers=h).json()["program_id"] == 1                # it was saved


def test_student_values_are_checked(env):
    c, _ = env
    h = login(c, "S1")
    dept, prog = ids(c)
    put = lambda **kw: c.put("/api/me/profile", headers=h, json={**STUDENT_PROFILE, **kw})

    assert "between 15 and 99" in put(age=14).json()["detail"]
    assert "between 15 and 99" in put(age=100).json()["detail"]
    assert put(age=15).status_code == 200 and put(age=99).status_code == 200
    assert "1st to 5th" in put(year_level=0).json()["detail"] and "1st to 5th" in put(year_level=6).json()["detail"]
    assert put(year_level=5).status_code == 200
    assert "Unknown department" in put(department_id=999).json()["detail"]
    assert "Unknown program" in put(program_id=999).json()["detail"]
    # a program from another department is refused
    engineering = prog["Bachelor of Science in Civil Engineering"]
    assert "does not belong" in put(program_id=engineering).json()["detail"]
    assert put(department_id=dept["COE"], program_id=engineering).status_code == 200
    # and a student cannot blank a required detail once it is set
    assert put(age=None).status_code == 422
    assert put(program_id=None).status_code == 422


def test_teachers_and_staff_give_only_age_and_department(env):
    c, _ = env
    for sr in ("T1", "F1"):
        h = login(c, sr)
        assert c.get("/api/auth/me", headers=h).json()["profile_complete"] is True      # nothing is required
        r = c.put("/api/me/profile", headers=h, json={"age": 38, "department_id": 5})   # General Service
        assert r.status_code == 200
        assert (r.json()["age"], r.json()["department"], r.json()["year_level"], r.json()["program"]) == (38, "General Service", None, None)
        # year level and program are only for students, so they are refused, not silently dropped
        for extra in ({"year_level": 2}, {"program_id": 1}):
            r = c.put("/api/me/profile", headers=h, json={"age": 38, "department_id": 1, **extra})
            assert r.status_code == 422 and "for students only" in r.json()["detail"]
        assert c.put("/api/me/profile", headers=h, json={}).json()["department"] is None  # they may clear them


def test_the_profile_needs_a_login(env):
    c, _ = env
    assert c.put("/api/me/profile", json=STUDENT_PROFILE).status_code == 401


# ---- registration ------------------------------------------------------------------------

def reg(c, sr, role=None, **extra):
    body = {"sr_code": sr, "full_name": "New Person", "email": f"{sr.lower()}@example.com", "password": PW, **extra}
    if role:
        body["role"] = role
    return c.post("/api/auth/register", json=body)


def test_student_registration_requires_the_four_details(env):
    c, _ = env
    r = reg(c, "N1")
    assert r.status_code == 422 and "Program is required" in r.json()["detail"]
    assert reg(c, "N1", age=20, department_id=1, year_level=1).status_code == 422          # no program
    assert reg(c, "N1", age=20, department_id=1, year_level=1, program_id=999).status_code == 422
    ok = reg(c, "N1", **STUDENT_PROFILE)
    assert ok.status_code == 201
    assert (ok.json()["department"], ok.json()["year_level"], ok.json()["profile_complete"]) == ("CICS", 1, True)


def test_teacher_and_staff_registration_never_takes_year_level_or_program(env):
    c, _ = env
    assert reg(c, "N2", "teacher").status_code == 201                                       # nothing required
    assert reg(c, "N3", "staff", age=33, department_id=5).status_code == 201                # age + department are fine
    r = reg(c, "N4", "teacher", year_level=2)
    assert r.status_code == 422 and "for students only" in r.json()["detail"]
    assert reg(c, "N5", "staff", program_id=1).status_code == 422


def test_a_failed_registration_creates_nothing(env):
    c, Session = env
    reg(c, "N6")
    with Session() as db:
        assert db.query(User).filter_by(sr_code="N6").count() == 0


# ---- admins manage the program list ---------------------------------------------------------

def test_admins_add_rename_and_delete_programs_without_spelling_variants(env):
    c, _ = env
    admin = login(c, "admin")
    dept, prog = ids(c)
    add = lambda name, d="CICS": c.post("/api/programs", headers=admin, json={"department_id": dept[d], "name": name})

    r = add("  Bachelor of Science in   Data Science ")
    assert r.status_code == 201 and r.json()["name"] == "Bachelor of Science in Data Science"
    for variant in ("bachelor of science in data science", "Bachelor of Science in Data-Science"):
        assert add(variant).status_code == 409, variant
    assert add("Bachelor of Science in Data Science", "COE").status_code == 201            # other department: fine
    assert c.post("/api/programs", headers=admin, json={"department_id": 999, "name": "X"}).status_code == 404

    pid = r.json()["id"]
    assert c.patch(f"/api/programs/{pid}", headers=admin, json={"name": "BS Data Science"}).json()["name"] == "BS Data Science"
    assert c.patch(f"/api/programs/{pid}", headers=admin, json={"name": "bs data science"}).status_code == 200    # own name
    assert c.patch(f"/api/programs/{pid}", headers=admin, json={"name": "Bachelor of Science in Computer Science"}).status_code == 409
    assert c.delete(f"/api/programs/{pid}", headers=admin).json() == {"ok": True, "students_moved": 0}
    assert c.delete("/api/programs/9999", headers=admin).status_code == 404


def test_only_admins_change_programs(env):
    c, _ = env
    s1 = login(c, "S1")
    body = {"department_id": 1, "name": "Sneaky Program"}
    assert c.post("/api/programs", json=body).status_code == 401
    assert c.post("/api/programs", headers=s1, json=body).status_code == 403
    assert c.patch("/api/programs/1", headers=s1, json={"name": "x"}).status_code == 403
    assert c.delete("/api/programs/1", headers=s1).status_code == 403
    assert c.get("/api/departments/overview", headers=s1).status_code == 403


def test_deleting_a_program_students_use_means_choosing_where_they_go(env):
    c, Session = env
    admin = login(c, "admin")
    dept, prog = ids(c)
    bsit, civil = prog["Bachelor of Science in Information Technology"], prog["Bachelor of Science in Civil Engineering"]
    assert c.put("/api/me/profile", headers=login(c, "S1"), json=STUDENT_PROFILE).status_code == 200

    r = c.delete(f"/api/programs/{bsit}", headers=admin)
    assert r.status_code == 409 and "reassign_to" in r.json()["detail"]
    assert c.delete(f"/api/programs/{bsit}", headers=admin, params={"reassign_to": 9999}).status_code == 404
    assert c.delete(f"/api/programs/{bsit}", headers=admin, params={"reassign_to": bsit}).status_code == 404

    r = c.delete(f"/api/programs/{bsit}", headers=admin, params={"reassign_to": civil})
    assert r.json() == {"ok": True, "students_moved": 1}
    me = c.get("/api/auth/me", headers=login(c, "S1")).json()
    assert (me["program"], me["department"], me["profile_complete"]) == ("Bachelor of Science in Civil Engineering", "COE", True)
    assert bsit not in ids(c)[1].values()


# ---- browsing people by department and program ------------------------------------------------

def test_the_admin_can_browse_users_by_department_program_and_year(env):
    c, Session = env
    admin = login(c, "admin")
    dept, prog = ids(c)
    for sr, d, p, y in [("N1", "CICS", "Bachelor of Science in Information Technology", 1),
                        ("N2", "CICS", "Bachelor of Science in Computer Science", 2),
                        ("N3", "COE", "Bachelor of Science in Civil Engineering", 2)]:
        assert reg(c, sr, age=19, department_id=dept[d], year_level=y, program_id=prog[p]).status_code == 201
    reg(c, "N4", "staff", age=40, department_id=dept["CICS"])

    codes = lambda **q: sorted(u["sr_code"] for u in c.get("/api/users", headers=admin, params=q).json()["items"])
    assert codes(department_id=dept["CICS"]) == ["N1", "N2", "N4"]
    assert codes(department_id=dept["CICS"], role="student") == ["N1", "N2"]
    assert codes(program_id=prog["Bachelor of Science in Computer Science"]) == ["N2"]
    assert codes(year_level=2) == ["N2", "N3"]
    assert codes(department_id=dept["COE"], year_level=1) == []


def test_the_overview_counts_people_per_department_and_program(env):
    c, _ = env
    admin = login(c, "admin")
    dept, prog = ids(c)
    reg(c, "N1", **STUDENT_PROFILE)
    reg(c, "N2", **STUDENT_PROFILE)
    reg(c, "N3", "staff", age=40, department_id=dept["CICS"])
    reg(c, "N4", "staff", age=50, department_id=dept["General Service"])

    overview = {d["name"]: d for d in c.get("/api/departments/overview", headers=admin).json()}
    cics = overview["CICS"]
    assert (cics["members"], cics["students"]) == (3, 2)
    assert {p["name"]: p["students"] for p in cics["programs"]}["Bachelor of Science in Information Technology"] == 2
    assert (overview["General Service"]["members"], overview["General Service"]["students"]) == (1, 0)
    assert overview["COE"]["members"] == 0


def test_the_users_list_needs_the_same_few_queries_however_many_people(env):
    """Showing each person's department and program must not cost extra queries per person."""
    from sqlalchemy import event
    c, Session = env
    admin = login(c, "admin")
    engine = Session.kw["bind"]
    count = []
    event.listen(engine, "before_cursor_execute", lambda *a: count.append(a[2]))

    def statements_for_list():
        count.clear()
        r = c.get("/api/users", headers=admin, params={"limit": 200})
        assert r.status_code == 200
        return len(count), r.json()["items"]

    for i in range(10):
        assert reg(c, f"A{i}", **STUDENT_PROFILE).status_code == 201
    few, _ = statements_for_list()
    for i in range(40):
        assert reg(c, f"B{i}", **STUDENT_PROFILE).status_code == 201
    many, items = statements_for_list()
    assert many == few                                   # 40 more people, not one more query
    assert len(items) == 54
    assert all(u["department"] == "CICS" and u["program"] for u in items if u["sr_code"][0] in "AB")


# ---- the migration for an existing database ------------------------------------------------------

def test_the_migration_keeps_existing_users_and_is_repeatable(tmp_path):
    import os, sqlite3
    db_file = tmp_path / "old.db"
    con = sqlite3.connect(db_file)
    con.execute("""CREATE TABLE users (id INTEGER PRIMARY KEY, sr_code VARCHAR(20) UNIQUE, full_name VARCHAR(120),
        email VARCHAR(255) UNIQUE, role VARCHAR(7), rfid_uid VARCHAR(32), rfid_active BOOLEAN, status VARCHAR(18),
        password_hash VARCHAR(255), created_at DATETIME, avatar BLOB, avatar_updated_at DATETIME)""")
    con.execute("INSERT INTO users (sr_code, full_name, email, role, rfid_active, status, created_at) "
                "VALUES ('24-0001','Juan','j@example.com','student',1,'active','2026-01-01')")
    con.commit(); con.close()

    run = lambda: subprocess.run([sys.executable, "-m", "scripts.add_profile_columns"], capture_output=True, text=True,
                                 env={**os.environ, "DATABASE_URL": f"sqlite:///{db_file}"})
    first, second = run(), run()
    assert first.returncode == 0, first.stderr
    assert "age, department_id, year_level, program_id" in first.stdout and "Created the departments" in first.stdout
    assert "already there" in second.stdout and "Departments already exist" in second.stdout

    con = sqlite3.connect(db_file)
    assert con.execute("SELECT sr_code, full_name, age, department_id FROM users").fetchall() == [("24-0001", "Juan", None, None)]
    assert [r[0] for r in con.execute("SELECT name FROM departments ORDER BY id")] == DEPARTMENT_NAMES
    assert con.execute("SELECT COUNT(*) FROM programs").fetchone()[0] > 0
