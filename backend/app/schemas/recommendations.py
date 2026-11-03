from typing import List, Optional

from pydantic import BaseModel

from app.models import CategoryType


class TopCategory(BaseModel):
    id: int
    name: str
    borrows: int


class TopGenre(BaseModel):
    id: int
    name: str
    borrows: int


class RecommendedItem(BaseModel):
    id: int
    name: str
    category: str
    type: CategoryType
    genre: Optional[str] = None
    reason: str                       # shown to the user, e.g. "Because you often borrow ..."
    score: Optional[float] = None     # null for "popular" fillers


class RecommendationsOut(BaseModel):
    strategy: str                     # "history" (matched their habits) or "popular" (no history)
    borrowing_blocked: Optional[str] = None   # "unpaid_fine" / "has_overdue" if they cannot borrow now
    top_categories: List[TopCategory]
    top_genres: List[TopGenre]
    items: List[RecommendedItem]
