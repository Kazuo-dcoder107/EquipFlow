"""Book genres: one managed list so spelling never varies. Anyone logged in can read;
admins add, rename and delete. A genre can never share a name with a category."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Equipment, Genre
from app.schemas.equipment import GenreIn, GenreOut
from app.security import get_current_user, require_admin
from app.services.taxonomy import find_conflict

router = APIRouter(prefix="/api/genres", tags=["genres"])


def _count(db: Session, genre_id: int) -> int:
    return db.scalar(select(func.count()).select_from(Equipment)
                     .where(Equipment.genre_id == genre_id))


def _get_or_404(db: Session, genre_id: int) -> Genre:
    genre = db.get(Genre, genre_id)
    if genre is None:
        raise HTTPException(status_code=404, detail="Genre not found")
    return genre


def _check_name(db: Session, name: str, genre_id: Optional[int] = None) -> None:
    clash = find_conflict(db, name, genre_id=genre_id)
    if clash:
        raise HTTPException(status_code=409, detail=clash)


@router.get("", response_model=List[GenreOut], dependencies=[Depends(get_current_user)])
def list_genres(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Equipment.genre_id, func.count())
                             .where(Equipment.genre_id.is_not(None))
                             .group_by(Equipment.genre_id)).all())
    genres = db.scalars(select(Genre).order_by(Genre.name)).all()
    return [GenreOut(id=g.id, name=g.name, book_count=counts.get(g.id, 0)) for g in genres]


@router.post("", response_model=GenreOut, status_code=201, dependencies=[Depends(require_admin)])
def create_genre(body: GenreIn, db: Session = Depends(get_db)):
    _check_name(db, body.name)
    genre = Genre(name=body.name)
    db.add(genre)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Genre already exists")
    return GenreOut(id=genre.id, name=genre.name, book_count=0)


@router.patch("/{genre_id}", response_model=GenreOut, dependencies=[Depends(require_admin)])
def rename_genre(genre_id: int, body: GenreIn, db: Session = Depends(get_db)):
    genre = _get_or_404(db, genre_id)
    if body.name != genre.name:
        _check_name(db, body.name, genre.id)
        genre.name = body.name
        db.commit()
    return GenreOut(id=genre.id, name=genre.name, book_count=_count(db, genre.id))


@router.delete("/{genre_id}", dependencies=[Depends(require_admin)])
def delete_genre(genre_id: int, reassign_to: Optional[int] = None, detach: bool = False,
                 db: Session = Depends(get_db)):
    """A genre that books still use is not deleted by accident: choose where those books
    go with `reassign_to=<genre id>`, or leave them without a genre with `detach=true`."""
    genre = _get_or_404(db, genre_id)
    in_use = _count(db, genre.id)
    if in_use:
        if reassign_to is not None:
            if reassign_to == genre.id or db.get(Genre, reassign_to) is None:
                raise HTTPException(status_code=404, detail="Target genre not found")
            db.execute(update(Equipment).where(Equipment.genre_id == genre.id)
                       .values(genre_id=reassign_to))
        elif detach:
            db.execute(update(Equipment).where(Equipment.genre_id == genre.id)
                       .values(genre_id=None))
        else:
            raise HTTPException(
                status_code=409,
                detail=f"{in_use} book(s) use this genre; pass reassign_to or detach=true")
    db.delete(genre)
    db.commit()
    return {"ok": True, "books_moved": in_use}
