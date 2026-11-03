"""Rule-based recommendations (no AI): suggest available items from the categories and
genres a user borrows most. Everything here is plain counting, so every suggestion can
be explained to the user.

How an item is scored for a user:
  * Every past borrow counts toward its category and (for books) its genre, with newer
    borrows weighing more (a borrow loses half its weight every HALF_LIFE_DAYS).
  * Each dimension becomes the user's share of their own history, so 0.6 means "60% of
    what this user borrows".
  * score = category share + GENRE_BOOST x genre share. Genre is the more specific signal,
    so it counts for more.
Items already out, damaged or needing maintenance are never suggested; books the user has
already borrowed are skipped (hardware can be borrowed again). If the user has no matching
history the list is filled with what other borrowers use most.
"""
from collections import Counter, defaultdict
from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (CategoryType, Equipment, EquipmentCondition, EquipmentStatus, Transaction,
                        User)
from app.schemas.recommendations import (RecommendationsOut, RecommendedItem, TopCategory,
                                         TopGenre)
from app.services.borrowing import _blocked_reason, _now

HALF_LIFE_DAYS = 60.0
GENRE_BOOST = 1.5
MAX_PER_BUCKET = 2   # at most this many items per (category, genre), so the list has variety


def _weight(borrowed_at: datetime, now: datetime) -> float:
    age_days = max((now - borrowed_at).total_seconds() / 86400, 0.0)
    return 0.5 ** (age_days / HALF_LIFE_DAYS)


def recommend(db: Session, user: User, limit: int = 5) -> RecommendationsOut:
    now = _now()
    history = db.scalars(
        select(Transaction).where(Transaction.user_id == user.id)
        .options(selectinload(Transaction.equipment).selectinload(Equipment.category),
                 selectinload(Transaction.equipment).selectinload(Equipment.genre))).all()

    cat_w: Dict[int, float] = defaultdict(float)
    genre_w: Dict[int, float] = defaultdict(float)
    cat_n, genre_n = Counter(), Counter()
    cat_names, genre_names = {}, {}
    read_books = set()
    for t in history:
        item, w = t.equipment, _weight(t.borrowed_at, now)
        cat_w[item.category_id] += w
        cat_n[item.category_id] += 1
        cat_names[item.category_id] = item.category.name
        if item.category.type == CategoryType.book:
            read_books.add(item.id)
            if item.genre_id is not None:
                genre_w[item.genre_id] += w
                genre_n[item.genre_id] += 1
                genre_names[item.genre_id] = item.genre.name
    cat_total, genre_total = sum(cat_w.values()), sum(genre_w.values())

    top_categories = [TopCategory(id=i, name=cat_names[i], borrows=n)
                      for i, n in cat_n.most_common(3)]
    top_genres = [TopGenre(id=i, name=genre_names[i], borrows=n) for i, n in genre_n.most_common(3)]

    blocked = _blocked_reason(db, user.id, now)
    popularity = dict(db.execute(select(Transaction.equipment_id, func.count())
                                 .group_by(Transaction.equipment_id)).all())

    candidates = db.scalars(
        select(Equipment).where(Equipment.status == EquipmentStatus.available,
                                Equipment.condition == EquipmentCondition.good)
        .options(selectinload(Equipment.category), selectinload(Equipment.genre))).all()
    candidates = [c for c in candidates if c.id not in read_books]

    scored = []
    for c in candidates:
        cat_share = cat_w.get(c.category_id, 0.0) / cat_total if cat_total else 0.0
        genre_share = genre_w.get(c.genre_id, 0.0) / genre_total if genre_total and c.genre_id else 0.0
        score = cat_share + GENRE_BOOST * genre_share
        if score > 0:
            reason = (f"Because you often borrow {c.genre.name} books" if genre_share > 0
                      else f"Because you often borrow {c.category.name}")
            scored.append((score, popularity.get(c.id, 0), c, reason))
    scored.sort(key=lambda s: (-s[0], -s[1], s[2].name, s[2].id))

    picked: List[RecommendedItem] = []
    seen, buckets = set(), Counter()

    def take(c: Equipment, reason: str, score: Optional[float]) -> None:
        bucket = (c.category_id, c.genre_id)
        if c.id in seen or buckets[bucket] >= MAX_PER_BUCKET or len(picked) >= limit:
            return
        seen.add(c.id)
        buckets[bucket] += 1
        picked.append(RecommendedItem(
            id=c.id, name=c.name, category=c.category.name, type=c.category.type,
            genre=c.genre.name if c.genre else None, reason=reason,
            score=None if score is None else round(score, 3)))

    for score, _, c, reason in scored:
        take(c, reason, score)
    matched = len(picked)

    # Fill any remaining slots (or a brand-new user's whole list) with what is popular
    fillers = sorted(candidates, key=lambda c: (-popularity.get(c.id, 0), c.name, c.id))
    for c in fillers:
        take(c, "Popular with other borrowers", None)

    strategy = "history" if matched else "popular"
    return RecommendationsOut(strategy=strategy, borrowing_blocked=blocked.code if blocked else None,
                              top_categories=top_categories, top_genres=top_genres, items=picked)
