"""Fill the genre list with a standard set (safe to run again; existing names are skipped).

    python -m scripts.seed_genres
Admins can add, rename or delete genres later through the API.
"""
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Genre
from app.services.taxonomy import find_conflict

DEFAULT_GENRES = [
    "Fiction", "Non-Fiction", "Science Fiction", "Fantasy", "Mystery", "Romance", "Horror",
    "History", "Biography", "Science", "Mathematics", "Technology", "Programming",
    "Engineering", "Business", "Self-Help", "Health", "Education", "Reference", "Literature",
]


def main() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        added = 0
        for name in DEFAULT_GENRES:
            if find_conflict(db, name):
                continue
            db.add(Genre(name=name))
            db.flush()
            added += 1
        db.commit()
        print(f"Added {added} genres ({len(DEFAULT_GENRES) - added} already present).")


if __name__ == "__main__":
    main()
