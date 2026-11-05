"""Add the profile-photo columns to an EXISTING database, keeping all its data.

    python -m scripts.add_avatar_columns

Safe to run more than once. (A brand-new database does not need this: the tables are
created with the columns already.)
"""
from sqlalchemy import inspect, text

import app.models  # noqa: F401
from app.database import Base, engine


def main() -> None:
    Base.metadata.create_all(engine)   # creates anything missing; leaves existing tables alone
    existing = {c["name"] for c in inspect(engine).get_columns("users")}
    wanted = {"avatar": "BLOB", "avatar_updated_at": "DATETIME"}
    added = [name for name in wanted if name not in existing]
    with engine.begin() as connection:
        for name in added:
            connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {wanted[name]}"))
    print(f"Added: {', '.join(added)}" if added else "The photo columns are already there.")


if __name__ == "__main__":
    main()
