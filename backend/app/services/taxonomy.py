"""Naming rules for categories and genres, so the two lists never overlap or duplicate.

Names are compared by a "key" that ignores case, spaces and punctuation, so "Sci-Fi",
"sci fi" and "SCIFI" count as the same name. A genre can never share a key with a
category (and the other way round): the filters on the equipment list and the
recommendations stay unambiguous.
"""
import re
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Genre


def name_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def find_conflict(db: Session, name: str, *, genre_id: Optional[int] = None,
                  category_id: Optional[int] = None) -> Optional[str]:
    """A message describing what `name` clashes with, or None. Pass the id of the row being
    renamed so it does not clash with itself."""
    key = name_key(name)
    for cat in db.scalars(select(Category)):
        if name_key(cat.name) == key and cat.id != category_id:
            return f'Clashes with the category "{cat.name}"'
    for genre in db.scalars(select(Genre)):
        if name_key(genre.name) == key and genre.id != genre_id:
            return f'Clashes with the genre "{genre.name}"'
    return None
