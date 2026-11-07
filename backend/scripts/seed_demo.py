"""Fill an EMPTY database with demo data, for trying out the web sites.

    python -m scripts.seed_demo

Creates (password for every account: password123):
  admin                 admin account for the admin site
  24-0001 Juan          CICS student (3rd year BSIT) with history, a current loan, an overdue book and an unpaid fine
  24-0002 Maria         student with a few returned books
  T-001   Tess          teacher (active)
  T-002   Tomas         teacher waiting for admin approval
  24-0003 Nico          student who still has to link an ID card at the kiosk
plus categories, genres, 23 books and some hardware.
Never run this on a database with real records: it refuses unless the database is empty.
"""
from datetime import timedelta

from sqlalchemy import func, select

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.models import (Category, CategoryType, Department, Equipment, EquipmentStatus, Genre, Penalty,
                        PenaltyStatus, PenaltyType, Program, Transaction, TransactionStatus, User, UserRole,
                        UserStatus)
from app.security import hash_password
from app.services.profile import bootstrap_school_structure
from app.services.borrowing import _now

PASSWORD = "password123"

BOOKS = {
    "Programming": ["Python Basics", "Clean Code", "Algorithms", "Databases", "Web Development",
                    "Operating Systems", "Computer Networks", "Software Engineering"],
    "Science Fiction": ["Dune", "Foundation", "Neuromancer"],
    "Fiction": ["Emma", "The Alchemist", "Little Women"],
    "Science": ["Cosmos", "A Brief History of Time", "The Selfish Gene"],
    "History": ["Sapiens", "Guns, Germs and Steel"],
    "Mathematics": ["Calculus Made Easy", "How to Solve It"],
}


def main() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(User)):
            raise SystemExit("The database already has users; the demo data is only for an empty one.")
        bootstrap_school_structure(db)   # departments and the starter programs
        pw = hash_password(PASSWORD)
        now = _now()

        def about(department, program, year, age):
            """The department/program/year/age details of a demo person."""
            dept = db.scalar(select(Department).where(Department.name == department))
            prog = db.scalar(select(Program).where(Program.department_id == dept.id, Program.name == program)) if program else None
            return dict(department_id=dept.id, program_id=prog.id if prog else None, year_level=year, age=age)

        book = Category(name="Book", type=CategoryType.book, loan_days=7, fine_per_day=5)
        laptop = Category(name="Laptop", type=CategoryType.hardware, loan_days=2, fine_per_day=25)
        kit = Category(name="Arduino Kit", type=CategoryType.hardware, loan_days=3, fine_per_day=20)
        projector = Category(name="Projector", type=CategoryType.hardware, loan_days=1, fine_per_day=30)
        genres = {name: Genre(name=name) for name in BOOKS}
        db.add_all([book, laptop, kit, projector, *genres.values()])

        def user(sr, name, email, **kw):
            u = User(sr_code=sr, full_name=name, email=email, password_hash=pw, **kw)
            db.add(u)
            return u

        user("admin", "Demo Admin", "admin@example.com", role=UserRole.admin, status=UserStatus.active)
        juan = user("24-0001", "Juan Dela Cruz", "juan@example.com", rfid_uid="0A000001", status=UserStatus.active,
                    **about("CICS", "Bachelor of Science in Information Technology", 3, 20))
        maria = user("24-0002", "Maria Santos", "maria@example.com", rfid_uid="0A000002", status=UserStatus.active,
                     **about("COE", "Bachelor of Science in Computer Engineering", 2, 19))
        user("T-001", "Tess Teacher", "tess@example.com", role=UserRole.teacher, rfid_uid="0A000003",
             status=UserStatus.active, **about("CICS", None, None, 41))
        user("T-002", "Tomas Torres", "tomas@example.com", role=UserRole.teacher,
             status=UserStatus.pending_approval)
        user("24-0003", "Nico Reyes", "nico@example.com", status=UserStatus.pending_enrollment,
             **about("CICS", "Bachelor of Science in Computer Science", 1, 18))

        items, n = {}, 0
        for genre, titles in BOOKS.items():
            for title in titles:
                n += 1
                items[title] = Equipment(rfid_uid=f"B{n:07d}", name=title, category=book,
                                         genre=genres[genre], replacement_cost=350)
        for i in range(1, 5):
            items[f"Laptop {i:02d}"] = Equipment(rfid_uid=f"L{i:07d}", name=f"Laptop {i:02d}",
                                                 category=laptop, replacement_cost=30000)
        for i in range(1, 4):
            items[f"Arduino Kit {i:02d}"] = Equipment(rfid_uid=f"K{i:07d}", name=f"Arduino Kit {i:02d}",
                                                      category=kit, replacement_cost=1500)
        items["Projector 01"] = Equipment(rfid_uid="P0000001", name="Projector 01", category=projector,
                                          replacement_cost=25000)
        db.add_all(items.values())
        db.flush()

        def loan(who, title, borrowed_days_ago, returned_days_ago=None, due_in_days=None):
            """A loan placed in the past (or still out when returned_days_ago is None)."""
            item = items[title]
            borrowed = now - timedelta(days=borrowed_days_ago)
            due = now + timedelta(days=due_in_days) if due_in_days is not None \
                else borrowed + timedelta(days=item.category.loan_days)
            returned = now - timedelta(days=returned_days_ago) if returned_days_ago is not None else None
            tx = Transaction(equipment_id=item.id, user_id=who.id, borrowed_at=borrowed, due_at=due,
                             returned_at=returned,
                             status=TransactionStatus.returned if returned else TransactionStatus.borrowed)
            db.add(tx)
            if not returned:
                item.status = EquipmentStatus.borrowed
            db.flush()
            return tx

        # Juan mostly reads Programming books
        for title, ago in [("Python Basics", 60), ("Clean Code", 45), ("Algorithms", 25), ("Dune", 80)]:
            loan(juan, title, ago, returned_days_ago=ago - 4)
        late = loan(juan, "Foundation", 30, returned_days_ago=20)      # returned late, fine unpaid
        db.add(Penalty(transaction_id=late.id, user_id=juan.id, type=PenaltyType.overdue_fine,
                       amount=15, status=PenaltyStatus.unpaid))
        db.add(Penalty(transaction_id=late.id, user_id=juan.id, type=PenaltyType.overdue_fine,
                       amount=10, status=PenaltyStatus.paid))
        loan(juan, "Web Development", 2)     # still out, due in 5 days
        loan(juan, "Databases", 10)          # out and 3 days overdue (so Juan is blocked from borrowing)
        loan(maria, "Cosmos", 15, returned_days_ago=10)
        loan(maria, "Emma", 40, returned_days_ago=35)
        loan(maria, "Laptop 01", 12, returned_days_ago=11)
        db.commit()
    print("Demo data created. Sign in with any account above (password: password123).")


if __name__ == "__main__":
    main()
