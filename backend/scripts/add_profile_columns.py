"""Add the age / department / year level / program columns to an EXISTING database,
keeping all its data, and create the departments and starter programs.

    python -m scripts.add_profile_columns

Safe to run more than once. (A brand-new database does not need this: it is created with
the columns, and the departments appear the first time the API starts.)

Students who registered before this change have no age, department, year level or program yet;
they will see a "complete your profile" notice until they fill them in.
"""
from sqlalchemy import inspect, text

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.services.profile import bootstrap_school_structure


def main() -> None:
    Base.metadata.create_all(engine)   # creates the departments and programs tables if missing
    existing = {c["name"] for c in inspect(engine).get_columns("users")}
    wanted = {
        "age": "INTEGER",
        "department_id": "INTEGER REFERENCES departments(id)",
        "year_level": "INTEGER",
        "program_id": "INTEGER REFERENCES programs(id)",
    }
    added = [name for name in wanted if name not in existing]
    with engine.begin() as connection:
        for name in added:
            connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {wanted[name]}"))
    with SessionLocal() as db:
        created = bootstrap_school_structure(db)
    print(f"Added columns: {', '.join(added)}" if added else "The profile columns are already there.")
    print("Created the departments and starter programs." if created else "Departments already exist.")


if __name__ == "__main__":
    main()
