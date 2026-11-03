from datetime import timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import *  # noqa: F401,F403
from app.services.borrowing import _now, borrow, current_fine, return_item


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        book = Category(name="Book", type=CategoryType.book, loan_days=7, fine_per_day=5)
        hw = Category(name="Laptop", type=CategoryType.hardware, loan_days=2, fine_per_day=25)
        s.add_all([
            book, hw,
            User(sr_code="A", full_name="A", email="a@x", rfid_uid="U1", status=UserStatus.active),
            User(sr_code="B", full_name="B", email="b@x", rfid_uid="U2", status=UserStatus.active),
            User(sr_code="C", full_name="C", email="c@x", rfid_uid="U3"),  # pending
            Equipment(rfid_uid="B1", name="Book 1", category=book, replacement_cost=300),
            Equipment(rfid_uid="B2", name="Book 2", category=book),
            Equipment(rfid_uid="B3", name="Book 3", category=book),
            Equipment(rfid_uid="L1", name="Laptop 1", category=hw),
            Equipment(rfid_uid="L2", name="Laptop 2", category=hw),
        ])
        s.commit()
        yield s


def test_hardware_needs_agreement(db):
    r = borrow(db, "L1", 1, agreed=False)
    assert (r.ok, r.code) == (False, "agreement_required")


def test_hardware_borrow_sets_due_date_and_status(db):
    r = borrow(db, "L1", 1, agreed=True)
    assert r.ok and r.transaction.agreement_accepted_at is not None
    assert r.transaction.due_at - r.transaction.borrowed_at == timedelta(days=2)
    assert db.query(Equipment).filter_by(rfid_uid="L1").one().status == EquipmentStatus.borrowed


def test_only_one_hardware(db):
    assert borrow(db, "L1", 1, agreed=True).ok
    assert borrow(db, "L2", 1, agreed=True).code == "limit_reached"


def test_two_books_max(db):
    assert borrow(db, "B1", 1).ok and borrow(db, "B2", 1).ok
    assert borrow(db, "B3", 1).code == "limit_reached"


def test_no_mixing_either_way(db):
    assert borrow(db, "B1", 1).ok
    assert borrow(db, "L1", 1, agreed=True).code == "limit_reached"
    assert borrow(db, "L1", 2, agreed=True).ok
    assert borrow(db, "B2", 2).code == "limit_reached"


def test_unknown_pending_and_unavailable(db):
    assert borrow(db, "B1", 99).code == "unknown_user"
    assert borrow(db, "B1", 3).code == "user_not_active"
    assert borrow(db, "NOPE", 1).code == "unknown_item"
    assert borrow(db, "B1", 1).ok
    assert borrow(db, "B1", 2).code == "item_unavailable"


def test_on_time_return_has_no_fine(db):
    borrow(db, "B1", 1)
    r = return_item(db, "B1")
    assert r.ok and r.message == "Returned"
    assert db.query(Penalty).count() == 0
    assert db.query(Equipment).filter_by(rfid_uid="B1").one().status == EquipmentStatus.available


def test_late_return_fines_by_category(db):
    tx = borrow(db, "L1", 1, agreed=True).transaction
    tx.due_at = _now() - timedelta(days=2, hours=3)   # 3 started days late
    db.commit()
    assert current_fine(tx) == 75
    assert return_item(db, "L1").message == "Returned. Fine P75"
    p = db.query(Penalty).one()
    assert (p.type, p.amount, p.status) == (PenaltyType.overdue_fine, 75, PenaltyStatus.unpaid)

    tx = borrow(db, "B1", 2).transaction
    tx.due_at = _now() - timedelta(days=1, hours=1)   # 2 started days late
    db.commit()
    return_item(db, "B1")
    assert db.query(Penalty).filter_by(user_id=2).one().amount == 10


def test_return_edge_cases(db):
    assert return_item(db, "B1").code == "not_borrowed"
    assert return_item(db, "NOPE").code == "unknown_item"
    db.query(Equipment).filter_by(rfid_uid="B1").one().status = EquipmentStatus.missing
    db.commit()
    assert return_item(db, "B1").code == "found"
    assert db.query(Equipment).filter_by(rfid_uid="B1").one().status == EquipmentStatus.available
