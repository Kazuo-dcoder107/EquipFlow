"""Equipment categories (loan length, fine rate). Anyone logged in can read; admins write."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Equipment
from app.schemas.equipment import CategoryIn, CategoryOut, CategoryUpdate
from app.security import get_current_user, require_admin
from app.services.taxonomy import find_conflict

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _out(c: Category, count: int) -> CategoryOut:
    return CategoryOut(id=c.id, name=c.name, type=c.type, loan_days=c.loan_days,
                       fine_per_day=c.fine_per_day, equipment_count=count)


def _count(db: Session, category_id: int) -> int:
    return db.scalar(select(func.count()).select_from(Equipment)
                     .where(Equipment.category_id == category_id))


def _get_or_404(db: Session, category_id: int) -> Category:
    cat = db.get(Category, category_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


def _name_taken(db: Session, name: str, except_id: int = 0) -> bool:
    return db.scalar(select(Category.id).where(Category.name == name,
                                               Category.id != except_id)) is not None


@router.get("", response_model=List[CategoryOut], dependencies=[Depends(get_current_user)])
def list_categories(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Equipment.category_id, func.count())
                             .group_by(Equipment.category_id)).all())
    cats = db.scalars(select(Category).order_by(Category.name)).all()
    return [_out(c, counts.get(c.id, 0)) for c in cats]


@router.post("", response_model=CategoryOut, status_code=201,
             dependencies=[Depends(require_admin)])
def create_category(body: CategoryIn, db: Session = Depends(get_db)):
    if _name_taken(db, body.name):
        raise HTTPException(status_code=409, detail="Category name already exists")
    clash = find_conflict(db, body.name)
    if clash:
        raise HTTPException(status_code=409, detail=clash)
    cat = Category(name=body.name, type=body.type, loan_days=body.loan_days,
                   fine_per_day=body.fine_per_day)
    db.add(cat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category name already exists")
    return _out(cat, 0)


@router.patch("/{category_id}", response_model=CategoryOut,
              dependencies=[Depends(require_admin)])
def update_category(category_id: int, body: CategoryUpdate, db: Session = Depends(get_db)):
    """Loan days apply to future borrows; the fine rate applies when an item is returned."""
    cat = _get_or_404(db, category_id)
    count = _count(db, cat.id)
    if body.name and body.name != cat.name:
        if _name_taken(db, body.name, cat.id):
            raise HTTPException(status_code=409, detail="Category name already exists")
        clash = find_conflict(db, body.name, category_id=cat.id)
        if clash:
            raise HTTPException(status_code=409, detail=clash)
        cat.name = body.name
    if body.type and body.type != cat.type:
        if count:
            raise HTTPException(status_code=409,
                                detail="Cannot change the type of a category that has equipment")
        cat.type = body.type
    if body.loan_days is not None:
        cat.loan_days = body.loan_days
    if body.fine_per_day is not None:
        cat.fine_per_day = body.fine_per_day
    db.commit()
    return _out(cat, count)


@router.delete("/{category_id}", dependencies=[Depends(require_admin)])
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = _get_or_404(db, category_id)
    if _count(db, cat.id):
        raise HTTPException(status_code=409, detail="Category still has equipment")
    db.delete(cat)
    db.commit()
    return {"ok": True}
