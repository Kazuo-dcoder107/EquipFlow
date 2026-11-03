"""Equipment inventory. Anyone logged in can browse; admins add, edit and delete.

Students get a reduced view without the RFID tag UID (returns are tag-only, so
the UID must stay private) and without the replacement cost.
Status is not editable here: it changes through borrowing/returning and, for
lost/damaged items, through the admin actions added with the penalties.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (ActivityLog, Category, CategoryType, Equipment, EquipmentCondition,
                        EquipmentStatus, Genre, Transaction, User, UserRole)
from app.schemas.equipment import EquipmentIn, EquipmentListOut, EquipmentOut, EquipmentUpdate
from app.security import get_current_user, require_admin
from app.services.overdue import sync_overdue
from app.services.tags import normalize_tag

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


def _out(item: Equipment, is_admin: bool) -> EquipmentOut:
    return EquipmentOut(
        id=item.id, name=item.name, category_id=item.category_id,
        category=item.category.name, type=item.category.type, status=item.status,
        genre_id=item.genre_id, genre=item.genre.name if item.genre else None,
        condition=item.condition, created_at=item.created_at,
        tag_uid=item.rfid_uid if is_admin else None,
        replacement_cost=item.replacement_cost if is_admin else None)


def _get_or_404(db: Session, equipment_id: int) -> Equipment:
    item = db.get(Equipment, equipment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return item


def _check_genre(db: Session, genre_id: Optional[int], category: Category) -> None:
    """A genre must exist and only books carry one."""
    if genre_id is None:
        return
    if db.get(Genre, genre_id) is None:
        raise HTTPException(status_code=404, detail="Genre not found")
    if category.type != CategoryType.book:
        raise HTTPException(status_code=409, detail="Genres apply to books only")


def _tag_taken(db: Session, tag: str, except_id: int = 0) -> bool:
    """True if the UID is already an item's tag or any user's ID tag."""
    if db.scalar(select(Equipment.id).where(Equipment.rfid_uid == tag,
                                            Equipment.id != except_id)) is not None:
        return True
    return db.scalar(select(User.id).where(User.rfid_uid == tag)) is not None


@router.get("", response_model=EquipmentListOut)
def list_equipment(search: Optional[str] = None, status: Optional[EquipmentStatus] = None,
                   category_id: Optional[int] = None, genre_id: Optional[int] = None,
                   type: Optional[CategoryType] = None, condition: Optional[EquipmentCondition] = None,
                   limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sync_overdue(db)
    is_admin = user.role == UserRole.admin
    q = select(Equipment).join(Category)
    if search and search.strip():
        conds = [Equipment.name.ilike(f"%{search.strip()}%")]
        if is_admin:  # admins can also find an item by its tag UID
            conds.append(Equipment.rfid_uid.ilike(f"%{normalize_tag(search)}%"))
        q = q.where(or_(*conds))
    if status:
        q = q.where(Equipment.status == status)
    if category_id:
        q = q.where(Equipment.category_id == category_id)
    if genre_id:
        q = q.where(Equipment.genre_id == genre_id)
    if type:
        q = q.where(Category.type == type)
    if condition:
        q = q.where(Equipment.condition == condition)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(Equipment.name, Equipment.id).limit(limit).offset(offset)).all()
    return EquipmentListOut(total=total, items=[_out(i, is_admin) for i in rows])


@router.get("/{equipment_id}", response_model=EquipmentOut)
def get_equipment(equipment_id: int, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    sync_overdue(db)
    return _out(_get_or_404(db, equipment_id), user.role == UserRole.admin)


@router.post("", response_model=EquipmentOut, status_code=201,
             dependencies=[Depends(require_admin)])
def create_equipment(body: EquipmentIn, db: Session = Depends(get_db)):
    category = db.get(Category, body.category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    _check_genre(db, body.genre_id, category)
    if _tag_taken(db, body.tag_uid):
        raise HTTPException(status_code=409, detail="Tag UID already in use (an item or an ID tag)")
    item = Equipment(rfid_uid=body.tag_uid, name=body.name, category_id=body.category_id,
                     genre_id=body.genre_id, replacement_cost=body.replacement_cost, condition=body.condition)
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Tag UID already in use (an item or an ID tag)")
    return _out(item, True)


@router.patch("/{equipment_id}", response_model=EquipmentOut,
              dependencies=[Depends(require_admin)])
def update_equipment(equipment_id: int, body: EquipmentUpdate, db: Session = Depends(get_db)):
    item = _get_or_404(db, equipment_id)
    if body.category_id is not None and body.category_id != item.category_id:
        if item.status in (EquipmentStatus.borrowed, EquipmentStatus.overdue):
            raise HTTPException(status_code=409,
                                detail="Cannot change the category of an item that is out")
        new_cat = db.get(Category, body.category_id)
        if new_cat is None:
            raise HTTPException(status_code=404, detail="Category not found")
        item.category_id = body.category_id
        db.flush()
        db.refresh(item)
        if new_cat.type != CategoryType.book and "genre_id" not in body.model_fields_set:
            item.genre_id = None   # moved out of the books: the genre no longer applies
    if "genre_id" in body.model_fields_set:
        _check_genre(db, body.genre_id, item.category)
        item.genre_id = body.genre_id
    if body.tag_uid and body.tag_uid != item.rfid_uid:
        if _tag_taken(db, body.tag_uid, item.id):
            raise HTTPException(status_code=409,
                                detail="Tag UID already in use (an item or an ID tag)")
        item.rfid_uid = body.tag_uid
    if body.name:
        item.name = body.name
    if body.replacement_cost is not None:
        item.replacement_cost = body.replacement_cost
    if body.condition:
        item.condition = body.condition
    db.commit()
    db.refresh(item)
    return _out(item, True)


@router.delete("/{equipment_id}", dependencies=[Depends(require_admin)])
def delete_equipment(equipment_id: int, db: Session = Depends(get_db)):
    """Only items that were never borrowed can be deleted; the rest keep their history."""
    item = _get_or_404(db, equipment_id)
    if db.scalar(select(func.count()).select_from(Transaction)
                 .where(Transaction.equipment_id == item.id)):
        raise HTTPException(status_code=409,
                            detail="Item has borrowing history and cannot be deleted")
    db.execute(update(ActivityLog).where(ActivityLog.equipment_id == item.id)
               .values(equipment_id=None))
    db.delete(item)
    db.commit()
    return {"ok": True}
